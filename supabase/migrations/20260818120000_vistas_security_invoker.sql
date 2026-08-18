-- Las vistas tienen que respetar el RLS de las tablas que leen.
--
-- Una vista en Postgres corre por defecto con los permisos de su DUENO, no de
-- quien la consulta, asi que saltea el RLS de las tablas de abajo. Supabase le
-- da SELECT a `anon` sobre todo lo que hay en `public`, y la anon key viaja al
-- browser: el resultado era que cualquiera, sin loguearse, leia alumnos_cuenta
-- entera (nombres, mails, telefonos y saldos) aunque la tabla `alumnos` si
-- estuviera protegida.
--
-- Con security_invoker la vista corre con los permisos del que consulta, asi
-- que el RLS de las tablas vuelve a aplicar. No cambia nada para el staff: sus
-- politicas ya le dejan leer todo.
--
-- Ojo al crear vistas nuevas: agregarles `with (security_invoker = on)`.

do $$
declare v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
  end loop;
end $$;
