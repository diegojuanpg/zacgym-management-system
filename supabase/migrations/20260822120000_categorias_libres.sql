-- Los rubros del catalogo se cargan desde la app, asi que dejan de ser un enum:
-- sumar "Ropa" no puede pedir una migracion y un deploy. Pasa a texto libre y no
-- a tabla como tarea_categorias porque de la categoria no cuelga nada, es solo
-- el nombre que se muestra y por el que se filtra.

-- El tipo esta en tres vistas: hay que bajarlas para poder cambiar la columna.
drop view public.ventas_por_dia;
drop view public.pagos_detalle;
drop view public.ventas_saldo;

alter table public.productos
  alter column categoria type text using categoria::text;

drop type public.categoria_producto;

comment on column public.productos.categoria is
  'Rubro del catalogo. Texto libre, se carga desde la app. null = todavia sin clasificar.';

-- Las tres vuelven igual que estaban: lo unico que cambio es el tipo de la
-- columna que arrastran.
create view public.ventas_saldo as
  select v.id,
         v.alumno_id,
         a.nombre_completo as alumno,
         v.producto_id,
         p.nombre as producto,
         v.cantidad,
         v.precio_unitario,
         v.total,
         v.creado_en,
         v.creado_por,
         v.anulada_en,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'efectivo'), 0)::integer as efectivo,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'transferencia'), 0)::integer as transferencia,
         coalesce(sum(pg.monto), 0)::integer as pagado,
         (v.total - coalesce(sum(pg.monto), 0))::integer as saldo,
         p.categoria,
         v.turno_id,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'no_paga'), 0)::integer as no_paga
    from public.ventas v
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id
    left join public.pagos pg on pg.venta_id = v.id
   group by v.id, a.nombre_completo, p.nombre, p.categoria;

alter view public.ventas_saldo set (security_invoker = on);
grant select on public.ventas_saldo to authenticated;

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
         v.anulada_en,
         coalesce(p.caja, 'grande')::public.caja as caja,
         pg.turno_id,
         p.categoria
    from public.pagos pg
    join public.ventas v on v.id = pg.venta_id
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id;

alter view public.pagos_detalle set (security_invoker = on);
grant select on public.pagos_detalle to authenticated;

create view public.ventas_por_dia as
  select (pg.creado_en at time zone 'America/Argentina/Buenos_Aires')::date as dia,
         case
           when (pg.creado_en at time zone 'America/Argentina/Buenos_Aires')::date
                <> (pg.venta_creada_en at time zone 'America/Argentina/Buenos_Aires')::date
             then 'cobro'
           else coalesce(pg.categoria, 'sin')
         end as rubro,
         sum(pg.monto)::integer as monto
    from public.pagos_detalle pg
   where pg.anulada_en is null
     and pg.metodo <> 'no_paga'
   group by 1, 2;

alter view public.ventas_por_dia set (security_invoker = on);
grant select on public.ventas_por_dia to authenticated;
