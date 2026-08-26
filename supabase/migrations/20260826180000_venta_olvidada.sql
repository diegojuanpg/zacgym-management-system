-- Cargar una venta que nadie anotó, en un turno que ya cerró.
--
-- El caso: al cerrar falta un agua y sobran $1.000. Eso no es un faltante, es
-- una venta que no se cargó. Hasta ahora la única salida era corregir el conteo
-- —tapar el sintoma— y la venta seguía sin existir: el alumno no figuraba, el
-- producto no bajaba y la recaudacion del dia quedaba corta.

/**
 * El trigger sella cada venta, pago y movimiento con el turno abierto. Ahora
 * respeta el turno que venga explicito: sin eso no hay forma de cargar algo en
 * un turno cerrado, porque el trigger lo pisa y ademas exige que haya uno
 * abierto. El que no trae turno sigue comportandose igual que siempre.
 */
create or replace function public.sellar_turno()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turno uuid;
begin
  if new.turno_id is not null then
    return new;
  end if;
  select id into v_turno from public.turnos where cerrado_en is null;
  if v_turno is null then
    raise exception 'no hay un turno abierto: inicia turno para cargar movimientos';
  end if;
  new.turno_id := v_turno;
  return new;
end;
$$;

/**
 * Rehace lo que el sistema esperaba en un turno: la plata de cada cajon y el
 * stock de cada producto al cerrar.
 *
 * Las dos cuentas estan congeladas en el momento del cierre, asi que cualquier
 * cosa que se corrija o se agregue despues las deja mintiendo. Vive en un solo
 * lugar porque la llaman las dos correcciones.
 */
create or replace function public.recalcular_turno(p_turno_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- La plata: con cuanto se abrio mas lo que entro por ventas y movimientos.
  update public.turnos t
     set caja_grande_esperada = t.caja_grande_inicial + v.grande + m.grande,
         caja_chica_esperada = t.caja_chica_inicial + v.chica + m.chica
    from (
      select coalesce(sum(pg.monto) filter (where coalesce(p.caja, 'grande') = 'grande'), 0)::integer as grande,
             coalesce(sum(pg.monto) filter (where coalesce(p.caja, 'grande') = 'chica'), 0)::integer as chica
        from public.pagos pg
        join public.ventas ve on ve.id = pg.venta_id
        join public.productos p on p.id = ve.producto_id
       where pg.turno_id = p_turno_id and pg.metodo = 'efectivo'
    ) v,
    (
      select coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end)
                        filter (where mc.caja = 'grande'), 0)::integer as grande,
             coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end)
                        filter (where mc.caja = 'chica'), 0)::integer as chica
        from public.movimientos_caja mc
       where mc.turno_id = p_turno_id and mc.metodo = 'efectivo' and mc.anulado_en is null
    ) m
   where t.id = p_turno_id and t.cerrado_en is not null;

  -- El stock: lo que se conto al abrir menos lo que se vendio en el turno.
  update public.turno_stock cierre
     set esperado = greatest(apertura.contado - coalesce(vendidas.cantidad, 0), 0)
    from public.turno_stock apertura
    left join lateral (
      select coalesce(sum(v.cantidad), 0)::integer as cantidad
        from public.ventas v
       where v.turno_id = apertura.turno_id
         and v.producto_id = apertura.producto_id
         and v.anulada_en is null
    ) vendidas on true
   where cierre.turno_id = p_turno_id
     and cierre.momento = 'cierre'
     and apertura.turno_id = cierre.turno_id
     and apertura.producto_id = cierre.producto_id
     and apertura.momento = 'apertura';
end;
$$;

grant execute on function public.recalcular_turno(uuid) to authenticated;

/**
 * Carga una venta en un turno cerrado, con la hora que se le indique.
 *
 * No toca `productos.stock`: el faltante ya esta contado en el cierre. Bajar el
 * stock ahora seria descontar dos veces la misma agua.
 *
 * Lo que si se rehace es lo que el turno esperaba: la caja pasa a esperar los
 * $1.000 y el cierre pasa a esperar un agua menos, asi que las dos diferencias
 * que delataron el olvido se cierran solas.
 */
create or replace function public.agregar_venta_olvidada(
  p_turno_id uuid,
  p_alumno_id uuid,
  p_producto_id uuid,
  p_creado_en timestamptz,
  p_cantidad smallint default 1,
  p_efectivo integer default 0,
  p_transferencia integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turno public.turnos%rowtype;
  v_producto public.productos%rowtype;
  v_venta uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'la cantidad tiene que ser mayor a cero';
  end if;
  if coalesce(p_efectivo, 0) < 0 or coalesce(p_transferencia, 0) < 0 then
    raise exception 'los montos no pueden ser negativos';
  end if;

  select * into v_turno from public.turnos where id = p_turno_id for update;
  if not found then
    raise exception 'el turno no existe';
  end if;

  -- La hora tiene que caer adentro del turno: una venta de las 23:00 no puede
  -- pertenecer a un turno que cerro a las 19:19.
  if p_creado_en < v_turno.abierto_en
     or (v_turno.cerrado_en is not null and p_creado_en > v_turno.cerrado_en) then
    raise exception 'esa hora queda fuera del turno (% a %)',
      to_char(v_turno.abierto_en at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'),
      coalesce(to_char(v_turno.cerrado_en at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI'), 'ahora');
  end if;

  select * into v_producto from public.productos where id = p_producto_id;
  if not found then
    raise exception 'producto inexistente';
  end if;

  insert into public.ventas
    (alumno_id, producto_id, cantidad, precio_unitario, creado_por, creado_en, turno_id)
  values
    (p_alumno_id, p_producto_id, p_cantidad, v_producto.precio, auth.uid(), p_creado_en, p_turno_id)
  returning id into v_venta;

  if coalesce(p_efectivo, 0) > 0 then
    insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
    values (v_venta, p_efectivo, 'efectivo', auth.uid(), p_creado_en, p_turno_id);
  end if;
  if coalesce(p_transferencia, 0) > 0 then
    insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
    values (v_venta, p_transferencia, 'transferencia', auth.uid(), p_creado_en, p_turno_id);
  end if;

  perform public.recalcular_turno(p_turno_id);

  update public.turnos
     set corregido_en = now(), corregido_por = auth.uid()
   where id = p_turno_id;

  return v_venta;
end;
$$;

grant execute on function public.agregar_venta_olvidada(uuid, uuid, uuid, timestamptz, smallint, integer, integer)
  to authenticated;

-- La correccion de conteos usa la misma cuenta, en vez de tener la suya.
create or replace function public.corregir_turno(
  p_turno_id uuid,
  p_grande_inicial integer default null,
  p_chica_inicial integer default null,
  p_grande_final integer default null,
  p_chica_final integer default null,
  p_stock jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if not exists (select 1 from public.turnos where id = p_turno_id) then
    raise exception 'el turno no existe';
  end if;
  if coalesce(p_grande_inicial, 0) < 0 or coalesce(p_chica_inicial, 0) < 0
     or coalesce(p_grande_final, 0) < 0 or coalesce(p_chica_final, 0) < 0 then
    raise exception 'los montos no pueden ser negativos';
  end if;

  update public.turnos
     set caja_grande_inicial = coalesce(p_grande_inicial, caja_grande_inicial),
         caja_chica_inicial = coalesce(p_chica_inicial, caja_chica_inicial),
         caja_grande_final = coalesce(p_grande_final, caja_grande_final),
         caja_chica_final = coalesce(p_chica_final, caja_chica_final),
         corregido_en = now(),
         corregido_por = auth.uid()
   where id = p_turno_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_stock, '[]'::jsonb)) loop
    if (v_item ->> 'contado')::integer < 0 then
      raise exception 'no se puede contar en negativo';
    end if;
    update public.turno_stock
       set contado = (v_item ->> 'contado')::integer
     where turno_id = p_turno_id
       and producto_id = (v_item ->> 'producto_id')::uuid
       and momento = (v_item ->> 'momento');
  end loop;

  perform public.recalcular_turno(p_turno_id);
end;
$$;
