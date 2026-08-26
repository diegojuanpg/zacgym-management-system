-- Borrar una venta de un turno ya cerrado no tiene que devolver el stock.
--
-- Devolverlo siempre inventa mercaderia: el turno ya conto la heladera al
-- cerrar, y en ese conteo la botella no estaba porque se habia vendido. Sumarla
-- de nuevo deja al sistema con una mas que la realidad, y el turno siguiente
-- abre contando bien y le aparece un faltante que no existe. Es lo que paso el
-- 26/8 con el agua: cerraron con 54, se borro una venta vieja, el sistema paso
-- a 55 y el turno de las 19:46 abrio con "-1 al abrir".
--
-- Si la venta es del turno abierto si se devuelve: ahi todavia no conto nadie,
-- el stock del sistema es el conteo de apertura menos lo vendido, y sacar una
-- venta de esa cuenta es exactamente lo correcto.
create or replace function public.borrar_venta(p_venta_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_abierto uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'la venta no existe';
  end if;

  select id into v_abierto from public.turnos where cerrado_en is null;

  -- Los pagos apuntan a la venta: se van primero o la FK corta el borrado.
  delete from public.pagos where venta_id = p_venta_id;
  delete from public.ventas where id = p_venta_id;

  -- Anular ya habia devuelto el stock: sumarlo de nuevo lo dejaria de mas.
  if v_venta.anulada_en is null
     and v_abierto is not null
     and v_venta.turno_id = v_abierto then
    update public.productos
       set stock = stock + v_venta.cantidad
     where id = v_venta.producto_id and stock is not null;
  end if;
end;
$$;
