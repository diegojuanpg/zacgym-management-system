-- Corregir el conteo de apertura del turno en curso tiene que mover el stock.
--
-- `abrir_turno` hace `productos.stock = contado`, asi que el stock de hoy sale
-- de ese numero. Si alguien declara 5 donde hay 2 y se corrige sin tocar el
-- stock, la heladera queda en 5 hasta el proximo cierre y todas las ventas del
-- turno restan sobre un numero inventado.
--
-- Es la excepcion a "corregir no toca el stock de hoy", y se sostiene sola: en
-- el turno abierto no hay nada aguas abajo, el stock actual ES ese conteo menos
-- lo que se vendio desde entonces. En un turno cerrado sigue sin tocarse.
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

    -- Turno abierto: el stock de hoy cuelga de esta apertura, asi que se rehace
    -- desde el numero corregido menos lo vendido en el turno.
    if v_turno.cerrado_en is null and (v_item ->> 'momento') = 'apertura' then
      update public.productos p
         set stock = greatest(
               (v_item ->> 'contado')::integer
                 - coalesce((select sum(v.cantidad)
                               from public.ventas v
                              where v.turno_id = p_turno_id
                                and v.producto_id = v_producto
                                and v.anulada_en is null), 0),
               0)
       where p.id = v_producto and p.stock is not null;
    end if;
  end loop;

  perform public.recalcular_turno(p_turno_id);
end;
$$;
