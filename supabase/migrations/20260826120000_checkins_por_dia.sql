-- Cuánta gente entrenó cada día, para el gráfico de barras de Alumnos.
--
-- `check_ins` es del pipeline: ya existe en el proyecto cloud, esto la declara
-- para que también exista después de un `db reset` local y la vista compile.
-- `if not exists` para no tocar la de producción, que es la que el pipeline
-- escribe. Es la misma maniobra que ya se hizo con `alumnos_tracking`.
create table if not exists public.check_ins (
  id                       text primary key,
  check_in_time            timestamptz,
  check_out_time           timestamptz,
  status                   text,
  user_id                  text,
  user_name                text,
  user_email               text,
  membership_id            text,
  membership_duration_days int,
  branch_id                text,
  activity_type            text,
  created_at               timestamptz,
  updated_at               timestamptz,
  service_id               text,
  raw                      jsonb,
  synced_at                timestamptz default now()
);

alter table public.check_ins enable row level security;

drop policy if exists staff_lee_checkins on public.check_ins;
create policy staff_lee_checkins on public.check_ins
  for select to authenticated using (true);

grant select on public.check_ins to authenticated;
revoke all on public.check_ins from anon;

/**
 * Personas distintas por día, no filas: el que entra dos veces el mismo día
 * entrenó una vez. La fecha se resuelve en hora Argentina, así que un check-in
 * de las 21:30 cuenta ese día y no el siguiente.
 *
 * Van todos los estados, `PENDING` incluido: para saber cuánta gente pisó el
 * gimnasio, que la aprobación haya quedado colgada no cambia nada.
 *
 * Son ~240 filas —el espejo arranca el 01/01/2026—, así que la página se las
 * lleva enteras y el navegador arma con eso las dos vistas del gráfico.
 */
create or replace view public.checkins_por_dia as
  select (check_in_time at time zone 'America/Argentina/Buenos_Aires')::date as dia,
         count(distinct user_id)::integer as personas
    from public.check_ins
   where check_in_time is not null
   group by 1;

alter view public.checkins_por_dia set (security_invoker = on);
grant select on public.checkins_por_dia to authenticated;
