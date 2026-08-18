-- El listado de alumnos sale de dos lados y ninguno alcanza solo.
--
-- El Google Sheets tiene los 1969 nombres bien escritos ("Apellido, Nombre") y
-- es el unico que sabe cual es el apellido. El pipeline tiene 646 con el mail,
-- el vencimiento y el ultimo check-in, pero el nombre en orden natural, asi que
-- no se puede partir sin adivinar.
--
-- Se cruzan una vez (script scripts/importar-alumnos.mjs) y el vinculo queda
-- guardado en alumnos.tracking_id. De ahi en mas el vencimiento no se copia: lo
-- lee la vista en vivo, asi el pipeline lo sigue actualizando solo.

alter table public.alumnos add column if not exists tracking_id text;

create unique index if not exists alumnos_tracking_id_key
  on public.alumnos (tracking_id) where tracking_id is not null;

/**
 * Alumno con su cuenta.
 *
 * Contacto y vencimiento son coalesce: lo que cargo el staff a mano le gana al
 * pipeline, y si no hay nada cargado se usa lo que el pipeline sepa.
 *
 * `activo` sigue siendo la marca manual de "esta en el padron" (es la que filtra
 * el combo del mostrador): un vencido tiene que poder aparecer para cobrarle la
 * renovacion. La vigencia se lee en `vence`.
 */
create or replace view public.alumnos_cuenta as
  select a.id,
         a.nombre_completo,
         a.apellido,
         a.nombre,
         coalesce(a.celular, t.numero) as celular,
         coalesce(a.email, t.gmail) as email,
         a.sheet_id,
         a.nacimiento,
         a.genero,
         coalesce(t.vencimiento::date, a.vence) as vence,
         a.activo,
         extract(year from age(a.nacimiento::timestamptz))::integer as edad,
         coalesce(v.comprado, 0::bigint)::integer as comprado,
         coalesce(p.pagado, 0::bigint)::integer as pagado,
         (coalesce(v.comprado, 0::bigint) - coalesce(p.pagado, 0::bigint))::integer as saldo,
         greatest(coalesce(v.comprado, 0::bigint) - coalesce(p.pagado, 0::bigint), 0::bigint)::integer as debe,
         greatest(coalesce(p.pagado, 0::bigint) - coalesce(v.comprado, 0::bigint), 0::bigint)::integer as a_favor,
         -- greatest ignora los null: alcanza con que uno de los tres exista.
         -- El check-in del pipeline cuenta como actividad aunque no haya comprado nada.
         greatest(v.ultima_compra, p.ultimo_pago, t.ultimo_checkin) as ultima_actividad,
         a.creado_en,
         a.tracking_id,
         t.estado as estado_membresia,
         t.ultimo_checkin,
         t.dias_entrenamiento
    from public.alumnos a
    left join public.alumnos_tracking t on t.id = a.tracking_id
    left join lateral (
      select sum(ventas.total) as comprado,
             max(ventas.creado_en) as ultima_compra
        from public.ventas
       where ventas.alumno_id = a.id and ventas.anulada_en is null
    ) v on true
    left join lateral (
      select sum(pg.monto) as pagado,
             max(pg.creado_en) as ultimo_pago
        from public.pagos pg
        join public.ventas ve on ve.id = pg.venta_id
       where ve.alumno_id = a.id and ve.anulada_en is null
    ) p on true;

alter view public.alumnos_cuenta set (security_invoker = on);
grant select on public.alumnos_cuenta to authenticated;
