-- Editar y borrar fichas de alumno.
--
-- Editar lo hace cualquiera del mostrador: corregir un apellido mal tipeado o
-- cargar el celular que faltaba es trabajo de todos los dias, igual que el
-- catalogo. Borrar es de admin: no hay papelera y la ficha no vuelve.
--
-- El borrado real solo alcanza a fichas sin historia. ventas y tareas apuntan
-- aca con on delete restrict, asi que un alumno que compro algo NO se puede
-- borrar, y esta bien: su plata es parte del arqueo de ese dia. Para esos
-- casos esta activo = false, que lo saca del mostrador sin tocar el historial.

drop policy admin_edita_alumnos on public.alumnos;

create policy staff_edita_alumnos on public.alumnos for update to authenticated
  using (true) with check (true);

create policy admin_borra_alumnos on public.alumnos for delete to authenticated
  using (public.es_admin());

grant delete on public.alumnos to authenticated;
