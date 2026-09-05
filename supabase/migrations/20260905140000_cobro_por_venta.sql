-- Cobrar una deuda suelta, no "la deuda del alumno".
--
-- Antes el cobro era por alumno y la plata se imputaba FIFO a las compras
-- impagas mas viejas. En el mostrador eso no se parece a lo que pasa: el
-- alumno viene a pagar la creatina, no "lo que debe". Ahora el cobro puede
-- venir apuntado a una venta y la plata entra ahi y en ningun otro lado.
--
-- Sin `p_venta_id` sigue siendo el FIFO de siempre: la firma vieja se usa en
-- otros lugares y esto no tiene por que romperla.
drop function if exists public.registrar_cobro(uuid, integer, integer, uuid, timestamptz);

create or replace function public.registrar_cobro(
  p_alumno_id uuid,
  p_efectivo integer default 0,
  p_transferencia integer default 0,
  p_turno_id uuid default null,
  p_creado_en timestamptz default null,
  p_venta_id uuid default null
)
returns integer   -- saldo del alumno despues del cobro
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_metodo public.metodo_pago;
  v_resto integer;
  v_aplicar integer;
  v_venta record;
  v_ultima uuid;
  v_saldo integer;
  v_cuando timestamptz := coalesce(p_creado_en, now());
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if coalesce(p_efectivo, 0) < 0 or coalesce(p_transferencia, 0) < 0 then
    raise exception 'los montos no pueden ser negativos';
  end if;
  if coalesce(p_efectivo, 0) + coalesce(p_transferencia, 0) = 0 then
    raise exception 'el cobro tiene que ser mayor a cero';
  end if;

  -- Cobro apuntado: la plata va a esa compra y se termina. Si entrega de mas,
  -- la venta queda pagada de mas y el excedente es saldo a favor, igual que
  -- cuando paga de mas en el momento.
  if p_venta_id is not null then
    perform 1 from public.ventas
     where id = p_venta_id and alumno_id = p_alumno_id and anulada_en is null;
    if not found then
      raise exception 'esa compra no es del alumno, o esta anulada';
    end if;

    if coalesce(p_efectivo, 0) > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
      values (p_venta_id, p_efectivo, 'efectivo', auth.uid(), v_cuando, p_turno_id);
    end if;
    if coalesce(p_transferencia, 0) > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
      values (p_venta_id, p_transferencia, 'transferencia', auth.uid(), v_cuando, p_turno_id);
    end if;

    select saldo into v_saldo from public.alumnos_cuenta where id = p_alumno_id;
    return v_saldo;
  end if;

  select id into v_ultima
    from public.ventas
   where alumno_id = p_alumno_id and anulada_en is null
   order by creado_en desc
   limit 1;
  if v_ultima is null then
    raise exception 'el alumno no tiene ventas donde imputar el cobro';
  end if;

  foreach v_metodo in array array['efectivo', 'transferencia']::public.metodo_pago[] loop
    v_resto := case
                 when v_metodo = 'efectivo' then coalesce(p_efectivo, 0)
                 else coalesce(p_transferencia, 0)
               end;

    for v_venta in
      select v.id,
             (v.total - coalesce((select sum(pg.monto) from public.pagos pg where pg.venta_id = v.id), 0))
               as saldo
        from public.ventas v
       where v.alumno_id = p_alumno_id and v.anulada_en is null
       order by v.creado_en
    loop
      exit when v_resto <= 0;
      continue when v_venta.saldo <= 0;

      v_aplicar := least(v_resto, v_venta.saldo);
      insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
      values (v_venta.id, v_aplicar, v_metodo, auth.uid(), v_cuando, p_turno_id);
      v_resto := v_resto - v_aplicar;
    end loop;

    if v_resto > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
      values (v_ultima, v_resto, v_metodo, auth.uid(), v_cuando, p_turno_id);
    end if;
  end loop;

  select saldo into v_saldo from public.alumnos_cuenta where id = p_alumno_id;
  return v_saldo;
end;
$$;

grant execute on function public.registrar_cobro(uuid, integer, integer, uuid, timestamptz, uuid)
  to authenticated;

-- Lo unico que cambia del lote: el cobro arrastra a que compra va.
create or replace function public.registrar_lote(
  p_ventas jsonb default '[]'::jsonb,
  p_movimientos jsonb default '[]'::jsonb,
  p_cobros jsonb default '[]'::jsonb,
  p_turno_id uuid default null,
  p_creado_en timestamptz default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_cargados integer := 0;
  v_turno public.turnos%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  if p_turno_id is not null then
    select * into v_turno from public.turnos where id = p_turno_id for update;
    if not found then
      raise exception 'el turno no existe';
    end if;
    if p_creado_en is null then
      raise exception 'hace falta la hora';
    end if;
    if p_creado_en < v_turno.abierto_en
       or (v_turno.cerrado_en is not null and p_creado_en > v_turno.cerrado_en) then
      raise exception 'esa hora queda fuera del turno (% a %)',
        to_char(v_turno.abierto_en at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
        coalesce(to_char(v_turno.cerrado_en at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'), 'ahora');
    end if;
  end if;

  if jsonb_typeof(p_ventas) = 'array' and jsonb_array_length(p_ventas) > 0 then
    v_cargados := public.registrar_ventas(p_ventas, p_turno_id, p_creado_en);

    if p_turno_id is not null and v_turno.cerrado_en is not null then
      for v_item in select * from jsonb_array_elements(p_ventas) loop
        perform public.mover_esperado_cierre(
          p_turno_id,
          (v_item ->> 'producto_id')::uuid,
          -coalesce((v_item ->> 'cantidad')::integer, 1)
        );
      end loop;
    end if;
  end if;

  if jsonb_typeof(p_movimientos) = 'array' then
    for v_item in select * from jsonb_array_elements(p_movimientos) loop
      perform public.registrar_movimiento(
        (v_item ->> 'tipo')::public.movimiento_tipo,
        (v_item ->> 'monto')::integer,
        v_item ->> 'motivo',
        coalesce((v_item ->> 'caja')::public.caja, 'grande'),
        coalesce((v_item ->> 'metodo')::public.metodo_pago, 'efectivo'),
        (v_item ->> 'alumno_id')::uuid,
        p_turno_id,
        p_creado_en
      );
      v_cargados := v_cargados + 1;
    end loop;
  end if;

  if jsonb_typeof(p_cobros) = 'array' then
    for v_item in select * from jsonb_array_elements(p_cobros) loop
      perform public.registrar_cobro(
        (v_item ->> 'alumno_id')::uuid,
        coalesce((v_item ->> 'efectivo')::integer, 0),
        coalesce((v_item ->> 'transferencia')::integer, 0),
        p_turno_id,
        p_creado_en,
        (v_item ->> 'venta_id')::uuid
      );
      v_cargados := v_cargados + 1;
    end loop;
  end if;

  if v_cargados = 0 then
    raise exception 'no hay nada para cargar';
  end if;

  if p_turno_id is not null and v_turno.cerrado_en is not null then
    perform public.recalcular_turno(p_turno_id);
    update public.turnos
       set corregido_en = now(), corregido_por = auth.uid()
     where id = p_turno_id;
  end if;

  return v_cargados;
end;
$$;
