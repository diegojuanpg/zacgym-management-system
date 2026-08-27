-- Cargar en un turno que ya cerró, con la hora que corresponda.
--
-- El modal de movimientos escribe siempre en el turno abierto y con la hora de
-- ahora: lo sella el trigger. Para corregir un turno viejo —la venta que nadie
-- anotó, el cobro que quedó sin cargar— hace falta poder decirle a qué turno y
-- a qué hora.
--
-- Las cuatro funciones toman los dos datos como opcionales. Sin ellos se
-- comportan exactamente igual que antes, que es el camino de todos los dias.
--
-- Reemplaza a agregar_venta_olvidada, que hacia esto para un solo caso.
drop function if exists public.agregar_venta_olvidada(uuid, uuid, uuid, timestamptz, smallint, integer, integer);

/**
 * El stock solo se mueve si la carga es del turno abierto.
 *
 * En un turno cerrado la heladera ya se contó, y ese conteo es la verdad: una
 * venta que se carga después explica por qué faltaba una botella, no hace
 * faltar otra. Es la misma regla que ya sigue borrar_venta.
 */
create or replace function public.turno_esta_abierto(p_turno_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select p_turno_id is null
      or exists (select 1 from public.turnos where id = p_turno_id and cerrado_en is null);
$$;

grant execute on function public.turno_esta_abierto(uuid) to authenticated;

drop function if exists public.registrar_ventas(jsonb);

create or replace function public.registrar_ventas(
  p_items jsonb,
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
  v_producto public.productos%rowtype;
  v_cantidad smallint;
  v_venta_id uuid;
  v_alumno_id uuid;
  v_efectivo integer;
  v_transferencia integer;
  v_no_paga integer;
  v_cargadas integer := 0;
  v_cuando timestamptz := coalesce(p_creado_en, now());
  v_mueve_stock boolean := public.turno_esta_abierto(p_turno_id);
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no hay ventas para cargar';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::smallint, 1);
    v_efectivo := coalesce((v_item ->> 'efectivo')::integer, 0);
    v_transferencia := coalesce((v_item ->> 'transferencia')::integer, 0);
    v_no_paga := coalesce((v_item ->> 'no_paga')::integer, 0);
    v_alumno_id := (v_item ->> 'alumno_id')::uuid;

    if v_efectivo < 0 or v_transferencia < 0 or v_no_paga < 0 then
      raise exception 'los montos no pueden ser negativos';
    end if;

    select * into v_producto
      from public.productos
     where id = (v_item ->> 'producto_id')::uuid
     for update;

    if not found then
      raise exception 'producto inexistente';
    end if;
    if not v_producto.activo then
      raise exception 'el producto % está desactivado', v_producto.nombre;
    end if;

    insert into public.ventas
      (alumno_id, producto_id, cantidad, precio_unitario, creado_por, creado_en, turno_id)
    values
      (v_alumno_id, v_producto.id, v_cantidad, v_producto.precio, auth.uid(), v_cuando, p_turno_id)
    returning id into v_venta_id;

    if v_efectivo > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
      values (v_venta_id, v_efectivo, 'efectivo', auth.uid(), v_cuando, p_turno_id);
    end if;
    if v_transferencia > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
      values (v_venta_id, v_transferencia, 'transferencia', auth.uid(), v_cuando, p_turno_id);
    end if;
    if v_no_paga > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
      values (v_venta_id, v_no_paga, 'no_paga', auth.uid(), v_cuando, p_turno_id);
    end if;

    -- Lo que tenia a favor se descuenta acá, no en la pantalla.
    perform public.aplicar_a_favor(v_alumno_id, v_venta_id);

    if v_producto.stock is not null and v_mueve_stock then
      update public.productos set stock = stock - v_cantidad where id = v_producto.id;
    end if;

    v_cargadas := v_cargadas + 1;
  end loop;

  return v_cargadas;
end;
$$;

drop function if exists public.registrar_cobro(uuid, integer, integer);

create or replace function public.registrar_cobro(
  p_alumno_id uuid,
  p_efectivo integer default 0,
  p_transferencia integer default 0,
  p_turno_id uuid default null,
  p_creado_en timestamptz default null
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

drop function if exists public.registrar_movimiento(
  public.movimiento_tipo, integer, text, public.caja, public.metodo_pago, uuid
);

create or replace function public.registrar_movimiento(
  p_tipo public.movimiento_tipo,
  p_monto integer,
  p_motivo text,
  p_caja public.caja default 'grande',
  p_metodo public.metodo_pago default 'efectivo',
  p_alumno_id uuid default null,
  p_turno_id uuid default null,
  p_creado_en timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_credito record;
  v_ultima uuid;
  v_resto integer;
  v_aplicar integer;
  v_cuando timestamptz := coalesce(p_creado_en, now());
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if p_monto <= 0 then
    raise exception 'el monto tiene que ser mayor a cero';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'hace falta un motivo';
  end if;
  if p_alumno_id is not null and p_tipo <> 'egreso' then
    raise exception 'una devolucion es plata que sale del cajon';
  end if;

  insert into public.movimientos_caja (tipo, caja, metodo, monto, motivo, creado_por, creado_en, turno_id)
  values (p_tipo, p_caja, p_metodo, p_monto, trim(p_motivo), auth.uid(), v_cuando, p_turno_id)
  returning id into v_id;

  if p_alumno_id is null then
    return v_id;
  end if;

  select id into v_ultima
    from public.ventas
   where alumno_id = p_alumno_id and anulada_en is null
   order by creado_en desc
   limit 1;
  if v_ultima is null then
    raise exception 'el alumno no tiene ventas donde descontar la devolucion';
  end if;

  v_resto := p_monto;

  for v_credito in
    select v.id, (sum(pg.monto) - v.total)::integer as sobra
      from public.ventas v
      join public.pagos pg on pg.venta_id = v.id
     where v.alumno_id = p_alumno_id and v.anulada_en is null
     group by v.id, v.total, v.creado_en
    having sum(pg.monto) > v.total
     order by v.creado_en
  loop
    exit when v_resto <= 0;
    v_aplicar := least(v_resto, v_credito.sobra);
    insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id, movimiento_id)
    values (v_credito.id, -v_aplicar, 'a_favor', auth.uid(), v_cuando, p_turno_id, v_id);
    v_resto := v_resto - v_aplicar;
  end loop;

  if v_resto > 0 then
    insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id, movimiento_id)
    values (v_ultima, -v_resto, 'a_favor', auth.uid(), v_cuando, p_turno_id, v_id);
  end if;

  return v_id;
end;
$$;

grant execute on function public.registrar_movimiento(
  public.movimiento_tipo, integer, text, public.caja, public.metodo_pago, uuid, uuid, timestamptz
) to authenticated;

drop function if exists public.registrar_lote(jsonb, jsonb, jsonb);

/**
 * Todo lo del modal en una transacción. Con `p_turno_id` y `p_creado_en` la
 * carga entra en un turno viejo, con la hora que se indique.
 *
 * La hora tiene que caer adentro del turno: una venta de las 23:00 no puede
 * pertenecer a un turno que cerro a las 19:19. Y al terminar se rehace lo que
 * el turno esperaba, para que la caja y el stock cierren con lo que se acaba de
 * cargar.
 */
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
        p_creado_en
      );
      v_cargados := v_cargados + 1;
    end loop;
  end if;

  if v_cargados = 0 then
    raise exception 'no hay nada para cargar';
  end if;

  -- Cargar en un turno viejo cambia lo que ese turno esperaba, y es una
  -- correccion: queda anotado igual que las otras.
  if p_turno_id is not null and v_turno.cerrado_en is not null then
    perform public.recalcular_turno(p_turno_id);
    update public.turnos
       set corregido_en = now(), corregido_por = auth.uid()
     where id = p_turno_id;
  end if;

  return v_cargados;
end;
$$;

grant execute on function public.registrar_lote(jsonb, jsonb, jsonb, uuid, timestamptz) to authenticated;
