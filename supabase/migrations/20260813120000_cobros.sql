-- Cobrar una deuda vieja: la plata cuenta el dia que entra al cajon, no el dia
-- de la venta que la origino. Sin esto la caja de un dia ya cerrado cambiaba
-- sola cuando el alumno venia a pagar semanas despues.

-- Pagos con contexto, para poder listarlos y sumarlos por dia.
create view public.pagos_detalle as
  select pg.id,
         pg.venta_id,
         v.alumno_id,
         a.nombre_completo as alumno,
         p.nombre as producto,
         pg.monto,
         pg.metodo,
         pg.creado_en,
         v.creado_en as venta_creada_en,
         v.anulada_en
    from public.pagos pg
    join public.ventas v on v.id = pg.venta_id
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id;

grant select on public.pagos_detalle to authenticated;

-- Un dia con solo cobros tambien es un dia con movimiento.
create or replace view public.dias_con_ventas as
  select dia from (
    select distinct (creado_en at time zone 'America/Argentina/Buenos_Aires')::date as dia
      from public.ventas
    union
    select distinct (creado_en at time zone 'America/Argentina/Buenos_Aires')::date
      from public.movimientos_caja
    union
    select distinct (creado_en at time zone 'America/Argentina/Buenos_Aires')::date
      from public.pagos
  ) d;

-- Cobro contra la cuenta del alumno: se imputa FIFO a las ventas impagas mas
-- viejas. Lo que sobre queda a favor sobre la ultima venta.
create or replace function public.registrar_cobro(
  p_alumno_id uuid,
  p_efectivo integer default 0,
  p_transferencia integer default 0
)
returns integer   -- saldo del alumno despues del cobro: positivo debe, negativo a favor
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
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_venta.id, v_aplicar, v_metodo, auth.uid());
      v_resto := v_resto - v_aplicar;
    end loop;

    -- Pago de mas: no hay a donde imputarlo, queda a favor sobre la ultima venta.
    if v_resto > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_ultima, v_resto, v_metodo, auth.uid());
    end if;
  end loop;

  select saldo into v_saldo from public.alumnos_cuenta where id = p_alumno_id;
  return v_saldo;
end;
$$;

grant execute on function public.registrar_cobro(uuid, integer, integer) to authenticated;

-- Deshacer un cobro mal cargado. Se borra la fila en vez de marcarla: es una
-- correccion de carga, no un hecho que valga la pena guardar.
-- ponytail: sin historial de anulaciones; agregar anulado_en si hace falta auditar
create or replace function public.anular_pago(p_pago_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  delete from public.pagos where id = p_pago_id;
  if not found then
    raise exception 'el pago no existe';
  end if;
end;
$$;

grant execute on function public.anular_pago(uuid) to authenticated;

-- El lote ahora tambien lleva cobros: todo lo que se carga desde el modal entra
-- en la misma transaccion.
drop function if exists public.registrar_lote(jsonb, jsonb);

create or replace function public.registrar_lote(
  p_ventas jsonb default '[]'::jsonb,
  p_movimientos jsonb default '[]'::jsonb,
  p_cobros jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_cargados integer := 0;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  if jsonb_typeof(p_ventas) = 'array' and jsonb_array_length(p_ventas) > 0 then
    v_cargados := public.registrar_ventas(p_ventas);
  end if;

  if jsonb_typeof(p_movimientos) = 'array' then
    for v_item in select * from jsonb_array_elements(p_movimientos) loop
      perform public.registrar_movimiento(
        (v_item ->> 'tipo')::public.movimiento_tipo,
        (v_item ->> 'monto')::integer,
        v_item ->> 'motivo',
        coalesce((v_item ->> 'caja')::public.caja, 'grande'),
        coalesce((v_item ->> 'metodo')::public.metodo_pago, 'efectivo')
      );
      v_cargados := v_cargados + 1;
    end loop;
  end if;

  if jsonb_typeof(p_cobros) = 'array' then
    for v_item in select * from jsonb_array_elements(p_cobros) loop
      perform public.registrar_cobro(
        (v_item ->> 'alumno_id')::uuid,
        coalesce((v_item ->> 'efectivo')::integer, 0),
        coalesce((v_item ->> 'transferencia')::integer, 0)
      );
      v_cargados := v_cargados + 1;
    end loop;
  end if;

  if v_cargados = 0 then
    raise exception 'no hay nada para cargar';
  end if;

  return v_cargados;
end;
$$;

grant execute on function public.registrar_lote(jsonb, jsonb, jsonb) to authenticated;
