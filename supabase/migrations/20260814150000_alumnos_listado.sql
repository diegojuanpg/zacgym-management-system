-- Lo que falta para el listado de alumnos: el id que traen del sheet viejo y
-- hasta cuándo tienen paga la cuota.

alter table public.alumnos
  add column sheet_id text,
  add column vence date;

comment on column public.alumnos.sheet_id is
  'Id del alumno en la Hoja Madre. Sirve para cruzar con lo viejo al importar.';
comment on column public.alumnos.vence is
  'Hasta cuando tiene paga la cuota. Todavia se carga a mano.';

-- Parcial: los que no vienen del sheet no tienen id y no se pisan entre si.
create unique index alumnos_sheet_id_key on public.alumnos (sheet_id) where sheet_id is not null;

-- La vista suma la ficha, la edad y la ultima vez que el alumno movio plata.
-- Se recrea entera porque cambia el orden de columnas.
drop view public.alumnos_cuenta;

create view public.alumnos_cuenta as
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
         -- Actividad = plata que se movio. Cuando haya check-ins entra tambien.
         greatest(v.ultima_compra, p.ultimo_pago) as ultima_actividad
    from public.alumnos a
    left join lateral (
      select sum(total) as comprado, max(creado_en) as ultima_compra
        from public.ventas
       where alumno_id = a.id and anulada_en is null
    ) v on true
    left join lateral (
      select sum(pg.monto) as pagado, max(pg.creado_en) as ultimo_pago
        from public.pagos pg
        join public.ventas vv on vv.id = pg.venta_id
       where vv.alumno_id = a.id and vv.anulada_en is null
    ) p on true;

grant select on public.alumnos_cuenta to authenticated;
