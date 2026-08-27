-- El que llega para el turno siguiente no estuvo a cargo del que termina.
--
-- El turno del 25/8 cerro 14:14, y Tomas declaro desde las 14:00 y Jeronimo
-- desde las 14:09 porque venian a cubrir el que empezaba. Como los horarios se
-- tocan, los dos figuraban a cargo de la manana.
--
-- No alcanza con pedir un minimo de minutos: Tomas comparte 15 con ese turno y
-- Clemente comparte 25, y Clemente si estuvo a cargo. Lo que los separa no es
-- cuanto sino hacia donde: Clemente estaba desde antes de que abriera, Tomas
-- llego sobre el final y siguio despues del cierre.
--
-- Asi que se descartan las dos puntas: el que aparece en el ultimo cuarto de
-- hora y sigue despues, y el que se estaba yendo cuando el turno arranco.
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
     and not (
       -- Llego sobre el final y siguio despues: es del turno que viene.
       (p_hasta is not null
          and a.inicia >= p_hasta - interval '15 minutes'
          and (a.termina is null or a.termina > p_hasta))
       -- O se estaba yendo cuando este arranco: era del turno anterior.
       or (a.termina is not null
             and a.termina <= p_desde + interval '15 minutes'
             and a.inicia < p_desde)
     )
   order by a.inicia, e.nombre;
$$;
