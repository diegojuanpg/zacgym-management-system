-- Corregir un turno ya cerrado: con cuánto arrancó cada caja, con cuánto la
-- cerraron, y cuánto se contó de cada producto.
--
-- Hace falta porque el conteo se tipea y a veces se tipea mal: el 25/8 alguien
-- abrió declarando 5 Monster donde había 2, y el turno quedó marcado con +3 al
-- abrir y -3 al cerrar para siempre. Sin esto la única salida era editar la
-- base a mano.
--
-- Dos cosas que la corrección NO hace, a propósito:
--
--   * No toca `productos.stock`. El stock de hoy es el ultimo conteo mas las
--     ventas posteriores; reescribirlo desde un turno viejo pisaría todo lo que
--     paso despues. Corregir arregla el registro, no la heladera.
--   * No toca el turno siguiente. Que un turno cierre con 100 y el siguiente
--     abra declarando 120 es justamente la señal que el sistema muestra como
--     salto entre turnos: emparejarlos solo la escondería.
--
-- Queda registrado quien corrigio y cuando: es plata, y una correccion sin
-- rastro es indistinguible de un numero inventado.
alter table public.turnos
  add column if not exists corregido_en timestamptz,
  add column if not exists corregido_por uuid references auth.users on delete restrict;

/**
 * Corrige lo declarado en un turno. Los parámetros en null se dejan como están.
 *
 * `p_stock` es un array de {producto_id, momento, contado}. Al corregir un
 * conteo de apertura se recalcula el `esperado` del cierre de ese mismo
 * producto —era la apertura menos lo vendido en el turno—, porque si no la
 * correccion arregla una punta y deja la otra marcando una diferencia que ya
 * no existe.
 */
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
  v_vendidas integer;
  v_apertura integer;
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
    if (v_item ->> 'contado')::integer < 0 then
      raise exception 'no se puede contar en negativo';
    end if;

    update public.turno_stock
       set contado = (v_item ->> 'contado')::integer
     where turno_id = p_turno_id
       and producto_id = v_producto
       and momento = (v_item ->> 'momento');

    -- Corregida la apertura, el cierre esperaba otra cosa: lo que se conto al
    -- abrir menos lo que se vendio en el turno.
    if (v_item ->> 'momento') = 'apertura' then
      select coalesce(sum(v.cantidad), 0) into v_vendidas
        from public.ventas v
       where v.turno_id = p_turno_id
         and v.producto_id = v_producto
         and v.anulada_en is null;

      v_apertura := (v_item ->> 'contado')::integer;

      update public.turno_stock
         set esperado = greatest(v_apertura - v_vendidas, 0)
       where turno_id = p_turno_id
         and producto_id = v_producto
         and momento = 'cierre';
    end if;
  end loop;

  -- Lo que el sistema esperaba en cada cajon sale del inicial mas lo que entro:
  -- corregido el inicial, hay que rehacer la cuenta o la diferencia miente.
  -- El turno abierto no lo necesita: ahi `turno_actual` lo calcula al vuelo.
  if v_turno.cerrado_en is not null then
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
     where t.id = p_turno_id;
  end if;
end;
$$;

grant execute on function public.corregir_turno(uuid, integer, integer, integer, integer, jsonb)
  to authenticated;
