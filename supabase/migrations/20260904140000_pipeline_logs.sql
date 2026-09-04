-- Lo que dejan los pipelines de Apps Script cuando corren. La tabla ya existe
-- en el proyecto cloud —la escribe el pipeline con service_role— y esto la
-- declara para que también exista después de un `db reset` local y las vistas
-- compilen. `if not exists` para no tocar la de producción.
create table if not exists public.pipeline_logs (
  id bigserial primary key,
  run_id text,
  pipeline text,
  nivel text,
  alumno_id text,
  gmail text,
  mensaje text,
  contexto jsonb,
  created_at timestamptz default now()
);

-- Venía con RLS prendido y cero policies: la escribía el pipeline con
-- service_role, que se saltea el RLS, y nadie más la leía nunca. La pantalla de
-- Pipelines la lee con la sesión del staff, así que ahora sí hace falta.
alter table public.pipeline_logs enable row level security;

drop policy if exists staff_lee_pipeline_logs on public.pipeline_logs;
create policy staff_lee_pipeline_logs on public.pipeline_logs
  for select to authenticated using (true);

grant select on public.pipeline_logs to authenticated;
-- En cloud la tabla tenía `grant all` a anon. El RLS igual la tapaba, pero un
-- log con mails de alumnos no tiene por qué estar al alcance de la anon key.
revoke all on public.pipeline_logs from anon;

-- Los nombres que se ven en la app. Apps Script ya escribe estos; el `case`
-- está para que las corridas viejas —guardadas con el nombre anterior— sigan
-- siendo el mismo pipeline y no aparezcan como uno aparte el día del cambio.
create or replace view public.pipeline_lineas as
  select id,
         run_id,
         case pipeline
           when 'sheetIds'        then 'SyncSheetsID'
           when 'syncCheckins'    then 'SyncCheckins'
           when 'syncMembers'     then 'SyncMembers'
           when 'rebuildTracking' then 'RebuildDatabase'
           when 'dias'            then 'SyncTrainingDays'
           when 'semanaRutina'    then 'SyncTrainingDate'
           when 'rutinas'         then 'UpdateAthleteProgram'
           else pipeline
         end as pipeline,
         nivel,
         alumno_id,
         gmail,
         mensaje,
         contexto,
         created_at
    from public.pipeline_logs;

alter view public.pipeline_lineas set (security_invoker = on);
grant select on public.pipeline_lineas to authenticated;

-- Una corrida es un `run_id`: el pipeline lo saca una vez al arrancar y lo
-- repite en cada línea que escribe. Sin run_id no hay corrida que agrupar.
--
-- `runHorario` comparte un mismo run_id entre SyncCheckins, SyncMembers y
-- RebuildDatabase, así que la corrida es el par (pipeline, run_id) y no el
-- run_id solo.
create or replace view public.pipeline_corridas as
  select pipeline,
         run_id,
         min(created_at) as inicio,
         max(created_at) as fin,
         count(*) filter (where nivel = 'error')::integer as errores,
         count(*) filter (where nivel = 'warn')::integer  as avisos,
         count(*)::integer as lineas
    from public.pipeline_lineas
   where run_id is not null
   group by pipeline, run_id;

alter view public.pipeline_corridas set (security_invoker = on);
grant select on public.pipeline_corridas to authenticated;

-- La última de cada uno, que es lo que mira la pantalla.
create or replace view public.pipeline_ultima as
  select distinct on (pipeline) *
    from public.pipeline_corridas
   order by pipeline, fin desc;

alter view public.pipeline_ultima set (security_invoker = on);
grant select on public.pipeline_ultima to authenticated;

-- ponytail: sin índices. La tabla son 136 kB y la vista la recorre entera cada
-- vez; a este tamaño no se nota. Cuando moleste, un índice en (pipeline,
-- created_at desc) y la consola pasa a filtrar en el server.
