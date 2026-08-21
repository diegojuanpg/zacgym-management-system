-- Plata cobrada por dia, para el grafico de Ventas. Se cuenta por pago y no por
-- venta: la plata cuenta el dia que entra al cajon, igual que la caja. El pago
-- hecho un dia distinto al de su venta es un cobro de deuda, como en la tabla.

-- La categoria del producto hace falta para saber de que rubro es el pago.
-- La columna nueva va al final: create or replace solo deja agregar.
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
         coalesce(p.caja, 'grande')::public.caja as caja,
         pg.turno_id,
         p.categoria
    from public.pagos pg
    join public.ventas v on v.id = pg.venta_id
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id;

alter view public.pagos_detalle set (security_invoker = on);

-- Un renglon por dia y rubro. Agregar en la base y no en el server: el grafico
-- mira un año entero y traer los pagos de a uno son miles de filas por pantalla.
-- Sin cargo no es plata que entro, y lo anulado no cuenta.
create or replace view public.ventas_por_dia as
  select (pg.creado_en at time zone 'America/Argentina/Buenos_Aires')::date as dia,
         case
           when (pg.creado_en at time zone 'America/Argentina/Buenos_Aires')::date
                <> (pg.venta_creada_en at time zone 'America/Argentina/Buenos_Aires')::date
             then 'cobro'
           else coalesce(pg.categoria::text, 'sin')
         end as rubro,
         sum(pg.monto)::integer as monto
    from public.pagos_detalle pg
   where pg.anulada_en is null
     and pg.metodo <> 'no_paga'
   group by 1, 2;

alter view public.ventas_por_dia set (security_invoker = on);
grant select on public.ventas_por_dia to authenticated;
