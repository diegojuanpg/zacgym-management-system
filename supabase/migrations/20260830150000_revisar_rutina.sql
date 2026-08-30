-- A quien le fallo la corrida de rutinas del domingo.
--
-- Los domingos a las 3 el script de Apps Script (`pipelines/apps-script-control/
-- Rutinas.gs`) le avanza o le repite la semana a todo el que entreno, y al que
-- sale bien le deja `rutina_semana` en el lunes siguiente. El que queda con
-- otra fecha es trabajo sin hacer: la planilla no se movio, o se movio mal.
--
-- La cuenta se hace en la base y no en la app porque la piden dos lugares —el
-- menu, que solo quiere el numero, y la solapa de Alumnos, que quiere quienes
-- son— y ninguno de los dos deberia bajarse los ~2000 alumnos y una semana de
-- check-ins para averiguarlo.

-- La semana que tendrian que tener todos, mirando el reloj.
--
-- El domingo abre y cierra: hasta las 3 lo esperado sigue siendo el lunes que
-- ya paso —la corrida todavia no ocurrio— y desde las 3 pasa a ser el que
-- viene, que es lo que el script escribe. Entre las 3 y el final de la corrida
-- aparecen como pendientes los que todavia no le tocaron, que es cierto.
--
-- El argumento existe para poder probarla con una hora fija: sin eso el unico
-- caso que se puede correr es "ahora".
create or replace function public.rutina_semana_esperada(ahora timestamptz default now())
returns date
language sql
stable
as $$
  select date_trunc('week', local)::date
         + case when extract(isodow from local) = 7 and local::time >= time '03:00'
                then 7 else 0 end
    from (select ahora at time zone 'America/Argentina/Buenos_Aires' as local) t;
$$;

comment on function public.rutina_semana_esperada(timestamptz) is
  'El lunes que la ultima corrida de rutinas tendria que haber dejado en alumnos.rutina_semana.';

-- Los que hay que ir a mirar: el script los proceso o tenia que procesarlos, y
-- la fecha no es la que corresponde.
--
-- "Tenia que procesarlos" es la cola de `colaRutinas_`: tienen planilla y
-- entrenaron en la semana que la corrida cerro. El cruce va por mail, igual que
-- alla. El que no tiene mail nunca se cruza con ningun check-in, asi que el
-- script no lo puede tocar aunque entrene: entra igual, pero solo si el
-- pipeline le sigue mirando la planilla —cuota al dia o actividad del ultimo
-- mes—, que si no serian 600 fichas viejas que nadie va a resolver.
--
-- Adelantado tambien entra: la planilla fechada mas lejos que la semana que
-- viene tampoco es lo que dejo la corrida.
create or replace view public.alumnos_revisar_rutina as
  with f as (select public.rutina_semana_esperada() as esperada)
  select a.id
    from public.alumnos_cuenta a, f
   where a.sheet_id is not null
     and a.rutina_semana is distinct from f.esperada
     and (
       exists (
         select 1
           from public.check_ins c
          where lower(btrim(c.user_email)) = lower(btrim(a.email))
            and c.check_in_time >= ((f.esperada - 7)::timestamp
                                    at time zone 'America/Argentina/Buenos_Aires')
            and c.check_in_time < (f.esperada::timestamp
                                   at time zone 'America/Argentina/Buenos_Aires')
       )
       or (
         coalesce(btrim(a.email), '') = ''
         and (a.vence >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
              or a.ultima_actividad >= now() - interval '30 days')
       )
     );

alter view public.alumnos_revisar_rutina set (security_invoker = on);
grant select on public.alumnos_revisar_rutina to authenticated;
