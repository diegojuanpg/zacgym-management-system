-- Ficha del alumno: lo que se pregunta en el mostrador cuando se anota alguien.
-- Todo opcional menos apellido y nombre: si falta un dato no se puede frenar
-- una venta con la fila esperando.

create type public.genero as enum ('femenino', 'masculino', 'otro');

alter table public.alumnos
  add column nacimiento date,
  add column genero public.genero,
  add column celular text,
  add column email text;
