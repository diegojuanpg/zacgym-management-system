-- Tareas del mostrador: algo pendiente sobre un alumno (llamarlo, pedirle el
-- apto, cobrarle). Tres datos: de quien, de que tipo y que hay que hacer.
--
-- La categoria es tabla y no enum porque se agrega y se quita desde la app:
-- cambiar un enum necesita migracion, y esto lo maneja el que atiende.

create table public.tarea_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  creado_en timestamptz not null default now()
);

create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos on delete restrict,
  -- Borrar una categoria no borra las tareas: quedan sin clasificar.
  categoria_id uuid references public.tarea_categorias on delete set null,
  detalle text not null check (length(trim(detalle)) > 0),
  creado_por uuid not null references auth.users on delete restrict,
  creado_en timestamptz not null default now()
);

create index tareas_alumno_idx on public.tareas (alumno_id);
create index tareas_fecha_idx on public.tareas (creado_en desc);

-- Para listar sin rearmar el join en cada pantalla.
create or replace view public.tareas_detalle as
  select t.id,
         t.alumno_id,
         a.nombre_completo as alumno,
         t.categoria_id,
         c.nombre as categoria,
         t.detalle,
         t.creado_en
    from public.tareas t
    join public.alumnos a on a.id = t.alumno_id
    left join public.tarea_categorias c on c.id = t.categoria_id;

-- ============================== permisos ==============================

alter table public.tareas enable row level security;
alter table public.tarea_categorias enable row level security;

-- Las tareas son del mostrador, igual que el catalogo: las toca cualquiera del staff.
create policy staff_categorias on public.tarea_categorias for all to authenticated
  using (true) with check (true);

create policy staff_lee on public.tareas for select to authenticated using (true);
create policy staff_crea on public.tareas for insert to authenticated
  with check (creado_por = auth.uid());
create policy staff_borra on public.tareas for delete to authenticated using (true);

grant select, insert, delete on public.tarea_categorias, public.tareas to authenticated;
grant select on public.tareas_detalle to authenticated;
