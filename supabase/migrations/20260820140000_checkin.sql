-- La asistencia pasa a ser Check-in y guarda tres horas en vez de dos.
--
-- Antes habia dos: `entro`, el momento del boton, y `salio`, hasta cuando pensaba
-- quedarse. El problema es que una sola hora hacia de dos cosas: cuando llegaste
-- y cuando arranca tu turno, que no son lo mismo. El que llega 6:50 para un
-- turno que arranca a las 7 no tiene por que responder por esos diez minutos.
--
-- Ahora son tres:
--   entro   -> "Llegaste". El momento del boton. No se elige y no se edita.
--   inicia  -> desde cuando corre el turno. Se declara y se puede corregir.
--   termina -> hasta cuando. Se declara y se puede corregir.
--
-- El cruce con los turnos pasa a mirar inicia/termina, que es el turno
-- declarado. `entro` queda como registro de puntualidad y no decide nada.

alter table public.asistencias rename column salio to termina;
alter table public.asistencias add column if not exists inicia timestamptz;
alter table public.asistencias drop constraint if exists asistencias_horario;

-- Lo que ya estaba: el turno arrancaba cuando la persona llegaba, que es lo unico
-- que el modelo viejo podia significar.
update public.asistencias set inicia = entro where inicia is null;
alter table public.asistencias alter column inicia set not null;

-- termina queda nullable a proposito. El check-in nuevo la exige —la funcion no
-- deja fichar sin ella—, pero las jornadas viejas que nunca declararon un fin no
-- tienen una: inventarles una hora seria peor que dejarlas en null, que es
-- exactamente lo que pasó.
alter table public.asistencias add constraint asistencias_horario
  check (termina is null or termina > inicia);

-- Nadie trabaja dos turnos a la vez. El solapamiento se mide sobre el turno
-- declarado, no sobre la llegada: es el mismo rango con el que se cruzan los
-- turnos.
alter table public.asistencias drop constraint asistencias_sin_solaparse;
alter table public.asistencias add constraint asistencias_sin_solaparse
  exclude using gist (empleado_id with =, tstzrange(inicia, termina) with &&);

-- ============================== fichar ==============================

drop function if exists public.fichar_asistencia(uuid, timestamptz);
drop function if exists public.editar_salida(uuid, timestamptz);

/**
 * Check-in. La llegada la pone la base: es el momento del boton. El turno se
 * declara entero, y puede haber arrancado antes de que la persona fichara.
 */
create or replace function public.fichar_asistencia(
  p_empleado uuid,
  p_inicia timestamptz,
  p_termina timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if p_empleado is null then
    raise exception 'elegí quién está fichando';
  end if;
  if p_inicia is null or p_termina is null then
    raise exception 'poné desde y hasta qué hora trabaja';
  end if;
  if p_termina <= p_inicia then
    raise exception 'el turno no puede terminar antes de empezar';
  end if;
  if exists (select 1 from public.asistencias
              where empleado_id = p_empleado
                and tstzrange(inicia, termina) @> now()) then
    raise exception 'ya hizo el check-in, todavía está trabajando';
  end if;

  insert into public.asistencias (empleado_id, inicia, termina, creado_por)
  values (p_empleado, p_inicia, p_termina, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

/**
 * Corrige el turno declarado. Las dos horas se pueden mover: lo que se puso al
 * fichar es un plan, y el dia real casi nunca sale igual. La llegada no se toca.
 */
create or replace function public.editar_horario(
  p_id uuid,
  p_inicia timestamptz,
  p_termina timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if p_inicia is null or p_termina is null then
    raise exception 'poné desde y hasta qué hora trabaja';
  end if;
  if p_termina <= p_inicia then
    raise exception 'el turno no puede terminar antes de empezar';
  end if;
  if not exists (select 1 from public.asistencias where id = p_id) then
    raise exception 'ese check-in no existe';
  end if;

  update public.asistencias
     set inicia = p_inicia, termina = p_termina
   where id = p_id;
end;
$$;

grant execute on function public.fichar_asistencia(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.editar_horario(uuid, timestamptz, timestamptz) to authenticated;

-- ============================== lectura ==============================

create or replace function public.empleados_en(
  p_desde timestamptz,
  p_hasta timestamptz default null
)
returns table (asistencia_id uuid, empleado_id uuid, nombre text,
               entro timestamptz, salio timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  -- Se cruza el turno declarado, no la llegada. Rangos semiabiertos: el que
  -- termina 10:04 no cuenta en el turno que arranco 10:04.
  select a.id, a.empleado_id, e.nombre, a.inicia, a.termina
    from public.asistencias a
    join public.empleados e on e.id = a.empleado_id
   where tstzrange(a.inicia, a.termina) && tstzrange(p_desde, coalesce(p_hasta, now()))
   order by a.inicia, e.nombre;
$$;

-- La vista cambia de columnas, asi que no alcanza con reemplazarla.
drop view if exists public.asistencias_detalle;

create view public.asistencias_detalle as
  select a.id,
         a.empleado_id,
         e.nombre,
         a.entro,
         a.inicia,
         a.termina,
         -- Sin fin declarado —solo jornadas viejas— sigue contando como adentro.
         (a.termina is null or a.termina > now()) as trabajando,
         a.creado_en
    from public.asistencias a
    join public.empleados e on e.id = a.empleado_id;

alter view public.asistencias_detalle set (security_invoker = on);
grant select on public.asistencias_detalle to authenticated;
