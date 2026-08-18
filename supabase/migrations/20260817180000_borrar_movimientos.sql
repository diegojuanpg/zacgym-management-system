-- El mostrador ahora ELIMINA el movimiento en vez de anularlo.
--
-- Hasta aca anular dejaba rastro (anulada_en, anulada_por) y la fila seguia en
-- la base. Se pidio borrado real: la fila desaparece y no queda registro de
-- quien la borro. Las columnas anulada_en / anulado_en se dejan porque todavia
-- hay filas viejas anuladas; nadie las escribe mas.

create or replace function public.borrar_venta(p_venta_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'la venta no existe';
  end if;

  -- Los pagos apuntan a la venta: se van primero o la FK corta el borrado.
  delete from public.pagos where venta_id = p_venta_id;
  delete from public.ventas where id = p_venta_id;

  -- Anular ya habia devuelto el stock: sumarlo de nuevo lo dejaria de mas.
  if v_venta.anulada_en is null then
    update public.productos
       set stock = stock + v_venta.cantidad
     where id = v_venta.producto_id and stock is not null;
  end if;
end;
$$;

create or replace function public.borrar_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  delete from public.movimientos_caja where id = p_movimiento_id;
  if not found then
    raise exception 'el movimiento no existe';
  end if;
end;
$$;

grant execute on function public.borrar_venta(uuid) to authenticated;
grant execute on function public.borrar_movimiento(uuid) to authenticated;

-- Mismo permiso que tenia anular: lo hace quien esta en el mostrador.
create policy staff_borra_ventas on public.ventas for delete to authenticated using (true);
create policy staff_borra_movimientos on public.movimientos_caja for delete to authenticated using (true);

grant delete on public.ventas, public.movimientos_caja to authenticated;
