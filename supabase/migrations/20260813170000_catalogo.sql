-- Catalogo editable desde la app: cada producto dice a que caja va su plata.
-- Los que ya estaban quedan sin caja hasta que alguien los asigne; para el
-- arqueo se cuentan en la grande, que es la caja por defecto del mostrador.

alter table public.productos add column caja public.caja;

comment on column public.productos.caja is
  'A que cajon va el efectivo de este producto. null = todavia sin asignar, cuenta como grande.';

-- El pago hereda la caja del producto que se vendio: asi el arqueo del dia
-- puede separar grande de chica sin mirar la venta.
create or replace view public.pagos_detalle as
  select pg.id,
         pg.venta_id,
         v.alumno_id,
         a.nombre_completo as alumno,
         p.nombre as producto,
         pg.monto,
         pg.metodo,
         pg.creado_en,
         v.creado_en as venta_creada_en,
         v.anulada_en,
         coalesce(p.caja, 'grande')::public.caja as caja
    from public.pagos pg
    join public.ventas v on v.id = pg.venta_id
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id;

grant select on public.pagos_detalle to authenticated;

-- Reposicion: se suma a lo que hay, no se pisa el numero. Contar mal el total
-- borraria ventas ya descontadas.
create or replace function public.sumar_stock(p_producto_id uuid, p_cantidad integer)
returns integer   -- stock que queda
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stock integer;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if p_cantidad = 0 then
    raise exception 'la cantidad tiene que ser distinta de cero';
  end if;

  select stock into v_stock from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'el producto no existe';
  end if;
  if v_stock is null then
    raise exception 'ese producto no lleva stock';
  end if;
  if v_stock + p_cantidad < 0 then
    raise exception 'no podes dejar el stock en negativo';
  end if;

  update public.productos set stock = stock + p_cantidad where id = p_producto_id
  returning stock into v_stock;
  return v_stock;
end;
$$;

grant execute on function public.sumar_stock(uuid, integer) to authenticated;

-- El catalogo lo carga quien esta en el mostrador, no solo un admin.
drop policy admin_catalogo on public.productos;
create policy staff_catalogo on public.productos for all to authenticated
  using (true) with check (true);
