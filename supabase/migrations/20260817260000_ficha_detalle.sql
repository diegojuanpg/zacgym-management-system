-- La ficha del alumno muestra desde cuando es socio; el dato ya estaba en
-- alumnos, faltaba exponerlo. Va al final porque create or replace sobre una
-- vista solo deja agregar columnas ahi.

create or replace view public.alumnos_cuenta as
  select a.id,
         a.nombre_completo,
         a.apellido,
         a.nombre,
         a.celular,
         a.email,
         a.sheet_id,
         a.nacimiento,
         a.genero,
         a.vence,
         a.activo,
         extract(year from age(a.nacimiento))::integer as edad,
         coalesce(v.comprado, 0)::integer as comprado,
         coalesce(p.pagado, 0)::integer as pagado,
         (coalesce(v.comprado, 0) - coalesce(p.pagado, 0))::integer as saldo,
         greatest(coalesce(v.comprado, 0) - coalesce(p.pagado, 0), 0)::integer as debe,
         greatest(coalesce(p.pagado, 0) - coalesce(v.comprado, 0), 0)::integer as a_favor,
         greatest(v.ultima_compra, p.ultimo_pago) as ultima_actividad,
         a.creado_en
    from public.alumnos a
    left join lateral (
      select sum(total) as comprado, max(creado_en) as ultima_compra
        from public.ventas
       where alumno_id = a.id and anulada_en is null
    ) v on true
    left join lateral (
      select sum(pg.monto) as pagado, max(pg.creado_en) as ultimo_pago
        from public.pagos pg
        join public.ventas ve on ve.id = pg.venta_id
       where ve.alumno_id = a.id and ve.anulada_en is null
    ) p on true;

grant select on public.alumnos_cuenta to authenticated;
