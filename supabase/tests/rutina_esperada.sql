-- Que la semana esperada de rutina se corra en el momento justo: el domingo a
-- las 3, cuando corre el script. Corre contra la base local y no escribe nada.
--
--   pnpm test:rutina

begin;

create or replace function pg_temp.chequear(p_caso text, p_ahora timestamptz, p_esperado date)
returns void language plpgsql as $$
declare v date;
begin
  v := public.rutina_semana_esperada(p_ahora);
  if v is distinct from p_esperado then
    raise exception '% : dio % y tenia que dar %', p_caso, v, p_esperado;
  end if;
end $$;

select pg_temp.chequear('miercoles',        '2026-08-26 10:00-03', date '2026-08-24');
select pg_temp.chequear('domingo 02:59',    '2026-08-30 02:59-03', date '2026-08-24');
select pg_temp.chequear('domingo 03:00',    '2026-08-30 03:00-03', date '2026-08-31');
select pg_temp.chequear('domingo 23:59',    '2026-08-30 23:59-03', date '2026-08-31');
select pg_temp.chequear('lunes temprano',   '2026-08-31 00:10-03', date '2026-08-31');
select pg_temp.chequear('sabado a la noche','2026-09-05 23:00-03', date '2026-08-31');

select 'rutina_esperada ok' as resultado;

rollback;
