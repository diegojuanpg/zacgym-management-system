-- Vendedor del producto: quien deja la mercaderia y a quien hay que darle lo
-- cobrado. Es un empleado de los que ya existen, los mismos de Check-in y de
-- "Anoto" en Tareas: no hay un padron aparte de gente que vende.
--
-- Va en el producto y no en la venta: lo que decide de quien es la plata es
-- que cosa se vendio, no quien la cargo en el mostrador.
alter table public.productos
  add column vendedor_id uuid references public.empleados(id) on delete restrict;

comment on column public.productos.vendedor_id is
  'Empleado dueno de la mercaderia. Lo cobrado por este producto se le entrega a el. null = es del gimnasio.';

-- Sin indice: el catalogo son decenas de filas y no se filtra por vendedor en
-- la base, se agrupa en la pantalla sobre los pagos del dia.

-- La vista suma el vendedor para que el mostrador pueda agrupar lo cobrado sin
-- volver a la tabla de productos por cada pago.
create or replace view public.pagos_detalle as
  select
    pg.id,
    pg.venta_id,
    v.alumno_id,
    a.nombre_completo as alumno,
    p.nombre as producto,
    pg.monto,
    pg.metodo,
    pg.creado_en,
    v.creado_en as venta_creada_en,
    v.anulada_en,
    coalesce(p.caja, 'grande'::caja) as caja,
    pg.turno_id,
    p.categoria,
    p.vendedor_id,
    e.nombre as vendedor
  from pagos pg
    join ventas v on v.id = pg.venta_id
    join alumnos a on a.id = v.alumno_id
    join productos p on p.id = v.producto_id
    left join empleados e on e.id = p.vendedor_id;
