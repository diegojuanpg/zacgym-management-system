-- Quien anoto la tarea, del mostrador.
--
-- No alcanza con `creado_por`: el login del mostrador es compartido, asi que esa
-- columna dice siempre el mismo usuario y no sirve para saber quien fue. El dato
-- que importa es el empleado, el mismo que ficha en `asistencias`.
--
-- Queda nullable a proposito: las tareas ya cargadas no tienen a quien
-- atribuirse, y ponerle un empleado inventado seria peor que dejarlo vacio. La
-- obligacion es para las nuevas y la pone la app.
alter table public.tareas
  add column anotado_por uuid references public.empleados(id) on delete restrict;

-- La vista suma el id y el nombre. Left join porque las viejas van en null.
create or replace view public.tareas_detalle as
  select t.id,
         t.alumno_id,
         a.nombre_completo as alumno,
         t.categoria_id,
         c.nombre as categoria,
         t.detalle,
         t.creado_en,
         t.estado,
         t.anotado_por,
         e.nombre as anoto
    from public.tareas t
    join public.alumnos a on a.id = t.alumno_id
    left join public.tarea_categorias c on c.id = t.categoria_id
    left join public.empleados e on e.id = t.anotado_por;

alter view public.tareas_detalle set (security_invoker = on);
grant select on public.tareas_detalle to authenticated;
