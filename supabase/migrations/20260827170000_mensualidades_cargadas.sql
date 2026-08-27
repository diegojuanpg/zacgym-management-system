-- Cada mensualidad que entra hay que cargarla en dos lugares de afuera: la
-- planilla y la app con la que se manejan los pagos. Estas dos columnas son el
-- acuse de que ya se hizo, una por sistema.
--
-- Son dos y no una sola a proposito. Con un tilde unico, el que carga en la
-- planilla y se olvida de la app no deja rastro de que quedo a medias; con dos,
-- la mitad hecha se ve. "Cargada" es tener las dos.
--
-- Guardan el momento y no un booleano: sale gratis y contesta "cuando se cargo"
-- sin una columna mas. Null es pendiente.
alter table public.ventas
  add column cargada_sheet_en timestamptz,
  add column cargada_app_en timestamptz;

-- La vista las expone para que la tabla de Ventas las lea junto con el resto.
-- Van al final: `create or replace` solo deja agregar.
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
         coalesce(sum(pg.monto) filter (where pg.metodo = 'efectivo'::metodo_pago), 0::bigint)::integer as efectivo,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'transferencia'::metodo_pago), 0::bigint)::integer as transferencia,
         coalesce(sum(pg.monto), 0::bigint)::integer as pagado,
         (v.total - coalesce(sum(pg.monto), 0::bigint))::integer as saldo,
         p.categoria,
         v.turno_id,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'no_paga'::metodo_pago), 0::bigint)::integer as no_paga,
         coalesce(sum(pg.monto) filter (where pg.metodo::text = 'a_favor'::text), 0::bigint)::integer as a_favor,
         v.cargada_sheet_en,
         v.cargada_app_en
    from ventas v
    join alumnos a on a.id = v.alumno_id
    join productos p on p.id = v.producto_id
    left join pagos pg on pg.venta_id = v.id
   group by v.id, a.nombre_completo, p.nombre, p.categoria;

alter view public.ventas_saldo set (security_invoker = on);
grant select on public.ventas_saldo to authenticated;
