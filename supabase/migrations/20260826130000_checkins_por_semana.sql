-- Cuánta gente distinta entrenó cada semana.
--
-- No es la suma de `checkins_por_dia`: el que va cuatro días es una persona,
-- no cuatro. La diferencia no es chica —la semana del 03/08 son 229 personas
-- contra 564 persona-días— y deduplicar entre días no se puede hacer con la
-- vista diaria ya agregada, hace falta volver a las filas crudas.
--
-- La semana va de lunes a domingo, igual que en el resto del listado.
create or replace view public.checkins_por_semana as
  select date_trunc('week', (check_in_time at time zone 'America/Argentina/Buenos_Aires'))::date
           as lunes,
         count(distinct user_id)::integer as personas
    from public.check_ins
   where check_in_time is not null
   group by 1;

alter view public.checkins_por_semana set (security_invoker = on);
grant select on public.checkins_por_semana to authenticated;
