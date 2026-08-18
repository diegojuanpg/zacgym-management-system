-- El historial filtra por rubro, asi que la venta tiene que saber de que rubro
-- era el producto. Se lee del catalogo en vivo (no se congela como el precio):
-- reclasificar un producto reordena tambien lo ya vendido, que es lo que uno
-- espera cuando arregla una categoria mal puesta.

create or replace view public.ventas_saldo as
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
         -- Ultima: create or replace solo deja agregar columnas al final.
         p.categoria
    from public.ventas v
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id
    left join public.pagos pg on pg.venta_id = v.id
   group by v.id, a.nombre_completo, p.nombre, p.categoria;

grant select on public.ventas_saldo to authenticated;

-- El historial pide por rango de fechas; sin esto es scan de toda la tabla.
create index if not exists pagos_fecha_idx on public.pagos (creado_en desc);
