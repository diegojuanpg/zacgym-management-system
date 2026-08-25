-- El listado de Alumnos se llena solo con lo que trae el pipeline.
--
-- PulsoFlow ya manda el genero y la fecha de nacimiento de cada socio: viajan
-- adentro de `alumnos_pulsoflow.raw -> user` (`sex`, `birthDate`) y el pipeline
-- los tiraba. Ahora `rebuild_alumnos_tracking()` los baja a `alumnos_tracking`
-- —esa funcion vive en el repo del pipeline— y la vista los lee de ahi.
--
-- Nada se copia a `alumnos`: la vista lee el espejo en vivo. El pipeline corre
-- a las 3am, actualiza `alumnos_tracking`, y el listado muestra lo nuevo en la
-- siguiente carga. No hay nada que sincronizar ni un job que se pueda atrasar.
--
-- Lo cargado a mano siempre le gana al pipeline: si alguien escribio el genero
-- en la ficha, ese queda. El vencimiento va al reves, y sigue como estaba: ahi
-- la verdad es PulsoFlow, que es donde se renueva la membresia.

alter table public.alumnos_tracking
  add column if not exists sexo text,
  add column if not exists nacimiento date;

comment on column public.alumnos_tracking.sexo is 'FEMALE / MALE, como lo manda PulsoFlow.';

-- El cruce por mail sin indice es un scan por alumno: 1960 x 654.
create index if not exists alumnos_tracking_gmail_idx
  on public.alumnos_tracking (lower(trim(gmail)));

/**
 * Cuenta corriente y ficha de cada alumno, con lo que agrega el pipeline.
 *
 * El enganche con el pipeline es por `tracking_id` y, si esta vacio, por mail.
 * En ese orden y no al reves: el UUID no cambia nunca, el mail si. Un alumno
 * que cambia de mail en PulsoFlow sigue enganchado por el UUID —y su actividad
 * y su vencimiento se le siguen actualizando solos—, mientras que cruzar solo
 * por mail lo dejaria huerfano justo el dia que lo cambia.
 *
 * `ultima_actividad` es el ultimo check-in y nada mas. Antes tambien miraba la
 * ultima venta y el ultimo pago, y eso hacia que 450 alumnos figuraran activos
 * por una compra vieja importada de la planilla, sin haber pisado el gimnasio.
 * La pregunta que contesta la columna es "¿este vino a entrenar?".
 */
create or replace view public.alumnos_cuenta as
  select a.id,
         a.nombre_completo,
         a.apellido,
         a.nombre,
         coalesce(a.celular, t.numero) as celular,
         coalesce(a.email, t.gmail) as email,
         a.sheet_id,
         coalesce(a.nacimiento, t.nacimiento) as nacimiento,
         coalesce(
           a.genero,
           case upper(t.sexo)
             when 'FEMALE' then 'femenino'
             when 'MALE' then 'masculino'
           end::public.genero
         ) as genero,
         coalesce(t.vencimiento::date, a.vence) as vence,
         a.activo,
         extract(year from age(coalesce(a.nacimiento, t.nacimiento)::timestamptz))::integer as edad,
         coalesce(v.comprado, 0::bigint)::integer as comprado,
         coalesce(p.pagado, 0::bigint)::integer as pagado,
         (coalesce(v.comprado, 0::bigint) - coalesce(p.pagado, 0::bigint))::integer as saldo,
         greatest(coalesce(v.comprado, 0::bigint) - coalesce(p.pagado, 0::bigint), 0::bigint)::integer as debe,
         greatest(coalesce(p.pagado, 0::bigint) - coalesce(v.comprado, 0::bigint), 0::bigint)::integer as a_favor,
         t.ultimo_checkin as ultima_actividad,
         a.creado_en,
         a.tracking_id,
         t.estado as estado_membresia,
         t.ultimo_checkin,
         t.dias_entrenamiento
    from public.alumnos a
    left join lateral (
      select tr.*
        from public.alumnos_tracking tr
       where tr.id = a.tracking_id
          or (a.email is not null and lower(trim(tr.gmail)) = lower(trim(a.email)))
       order by (tr.id = a.tracking_id) desc
       limit 1
    ) t on true
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
