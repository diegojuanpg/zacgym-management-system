-- Recalcular el stock esperado desde cero borraba las reposiciones.
--
-- `recalcular_turno` rehacia el esperado del cierre como "lo contado al abrir
-- menos lo vendido". Esa cuenta ignora que en el medio puede entrar mercaderia:
-- el turno del 26/8 abrio con 25 aguas, repusieron 32, cerraron contando 57 y
-- cuadraba. Al correr una correccion, el esperado volvio a 25 e invento un
-- sobrante de 32.
--
-- El esperado del cierre es una foto de lo que el sistema creia en ese momento y
-- no se puede reconstruir. Lo que si se puede es moverlo por la diferencia: si
-- se corrige el conteo de apertura, el cierre esperaba esa misma diferencia de
-- mas o de menos; si se agrega una venta que nadie anoto, esperaba una unidad
-- menos. Eso conserva lo que haya pasado en el medio.

/**
 * Solo la plata: con cuanto se abrio mas lo que entro por ventas y movimientos.
 *
 * El stock salio de aca a proposito. Ver el comentario de arriba.
 */
create or replace function public.recalcular_turno(p_turno_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
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
end;
$$;

/** Le suma `p_delta` a lo que el cierre de ese turno esperaba de ese producto. */
create or replace function public.mover_esperado_cierre(
  p_turno_id uuid,
  p_producto_id uuid,
  p_delta integer
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.turno_stock
     set esperado = greatest(esperado + p_delta, 0)
   where turno_id = p_turno_id
     and producto_id = p_producto_id
     and momento = 'cierre';
$$;

grant execute on function public.mover_esperado_cierre(uuid, uuid, integer) to authenticated;

-- Corregir el conteo de apertura mueve el esperado del cierre por la misma
-- diferencia, en vez de rehacerlo.
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
  v_turno public.turnos%rowtype;
  v_item jsonb;
  v_producto uuid;
  v_nuevo integer;
  v_viejo integer;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  select * into v_turno from public.turnos where id = p_turno_id for update;
  if not found then
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
    v_producto := (v_item ->> 'producto_id')::uuid;
    v_nuevo := (v_item ->> 'contado')::integer;
    if v_nuevo < 0 then
      raise exception 'no se puede contar en negativo';
    end if;

    select contado into v_viejo
      from public.turno_stock
     where turno_id = p_turno_id
       and producto_id = v_producto
       and momento = (v_item ->> 'momento');

    update public.turno_stock
       set contado = v_nuevo
     where turno_id = p_turno_id
       and producto_id = v_producto
       and momento = (v_item ->> 'momento');

    if (v_item ->> 'momento') = 'apertura' and v_viejo is not null then
      -- Lo que se conto al abrir cambio: el cierre esperaba esa diferencia.
      perform public.mover_esperado_cierre(p_turno_id, v_producto, v_nuevo - v_viejo);

      -- Turno abierto: el stock de hoy cuelga de esta apertura.
      if v_turno.cerrado_en is null then
        update public.productos p
           set stock = greatest(p.stock + (v_nuevo - v_viejo), 0)
         where p.id = v_producto and p.stock is not null;
      end if;
    end if;
  end loop;

  perform public.recalcular_turno(p_turno_id);
end;
$$;

-- Y cargar una venta en un turno cerrado baja lo que ese cierre esperaba.
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

    -- En un turno cerrado el stock no se toca, pero el cierre esperaba una
    -- unidad menos por cada cosa que ahora sabemos que se vendio.
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
        p_creado_en
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

-- El daño ya hecho: el cierre del 26/8 esperaba 57 aguas —25 del conteo mas 32
-- repuestas— y quedo en 25. Con guarda, por si ya lo tocaron a mano.
update public.turno_stock ts
   set esperado = ts.contado
  from public.turnos t, public.productos p
 where ts.turno_id = t.id
   and ts.producto_id = p.id
   and ts.momento = 'cierre'
   and p.nombre = 'Agua 600ml'
   and t.abierto_en >= '2026-08-26T09:00:00Z'
   and t.abierto_en < '2026-08-26T10:00:00Z'
   and ts.contado = 57
   and ts.esperado = 25;
