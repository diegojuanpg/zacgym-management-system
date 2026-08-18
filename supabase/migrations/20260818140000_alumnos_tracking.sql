-- La tabla que llena el pipeline con la gente que tiene membresia. Ya existe en
-- el proyecto cloud; esto la declara para que tambien exista despues de un
-- `db reset` local y las vistas que la leen compilen. `if not exists` para no
-- tocar la de produccion, que es la que el pipeline escribe.
create table if not exists public.alumnos_tracking (
  id text primary key,
  nombre text,
  gmail text,
  numero text,
  sheet_id text,
  dias_entrenamiento integer,
  ultimo_checkin timestamptz,
  vencimiento timestamptz,
  estado text,
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  ultima_rutina_semana date
);

-- Venia con RLS prendido y cero policies: ni el staff podia leerla. El pipeline
-- escribe con service_role, que se saltea el RLS, asi que no necesita policy.
alter table public.alumnos_tracking enable row level security;

drop policy if exists staff_lee_tracking on public.alumnos_tracking;
create policy staff_lee_tracking on public.alumnos_tracking
  for select to authenticated using (true);

grant select on public.alumnos_tracking to authenticated;
revoke all on public.alumnos_tracking from anon;
