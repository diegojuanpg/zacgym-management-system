-- Una tarea no se borra cuando se hace: pasa a terminada. Asi queda el registro
-- de lo que se hizo y de lo que sigue esperando.
create type public.tarea_estado as enum ('pendiente', 'en_proceso', 'terminada');

alter table public.tareas
  add column if not exists estado public.tarea_estado not null default 'pendiente';

-- Lo que se mira siempre es lo que falta hacer.
create index if not exists tareas_pendientes_idx
  on public.tareas (creado_en desc) where estado <> 'terminada';

create or replace view public.tareas_detalle as
  select t.id,
         t.alumno_id,
         a.nombre_completo as alumno,
         t.categoria_id,
         c.nombre as categoria,
         t.detalle,
         t.creado_en,
         t.estado
    from public.tareas t
    join public.alumnos a on a.id = t.alumno_id
    left join public.tarea_categorias c on c.id = t.categoria_id;

alter view public.tareas_detalle set (security_invoker = on);
grant select on public.tareas_detalle to authenticated;

-- La tabla tenia para leer, crear y borrar, pero no para editar. Hacen falta las
-- dos cosas: el grant y la policy. Sin el grant Postgres corta antes de mirar el
-- RLS; sin la policy el update no falla, no hace nada.
grant update on public.tareas to authenticated;

drop policy if exists staff_edita on public.tareas;
create policy staff_edita on public.tareas
  for update to authenticated using (true) with check (true);
