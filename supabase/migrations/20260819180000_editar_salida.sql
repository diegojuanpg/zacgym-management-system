-- La salida se edita, no solo se cierra.
--
-- terminar_asistencia solo servia para irse antes: rechazaba cualquier hora
-- futura. Pero el error va para los dos lados —fichaste hasta las 14 y te
-- quedaste hasta las 18— y con un solo boton "Editar" se arreglan los dos.
--
-- Lo unico que sigue siendo imposible es salir antes de haber entrado.
drop function if exists public.terminar_asistencia(uuid, timestamptz);

create or replace function public.editar_salida(
  p_id uuid,
  p_salio timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entro timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if p_salio is null then
    raise exception 'poné hasta que hora trabaja';
  end if;

  select entro into v_entro from public.asistencias where id = p_id;
  if not found then
    raise exception 'esa asistencia no existe';
  end if;
  if p_salio <= v_entro then
    raise exception 'entró %, no puede salir antes',
      to_char(v_entro at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI');
  end if;

  update public.asistencias set salio = p_salio where id = p_id;
exception
  -- La jornada estirada se pisa con otra de la misma persona. El error crudo de
  -- Postgres no dice nada util en el mostrador.
  when exclusion_violation then
    raise exception 'esa hora se pisa con otra jornada suya del mismo día';
end;
$$;

grant execute on function public.editar_salida(uuid, timestamptz) to authenticated;
