-- El turno que nadie cerro se cierra solo a las 00:00.
--
-- El caso real: el ultimo del dia se va sin cerrar. Al otro dia el turno sigue
-- abierto, la caja del dia anterior se mezcla con la del nuevo y el control del
-- dia deja de tener un "primer turno" del que salga el saldo inicial.
--
-- Se atiende como mucho hasta las 23, asi que a las 00:00 no hay nadie
-- vendiendo: cortar ahi no le arruina el turno a nadie.
--
-- El autocierre no cuenta la caja ni el stock, porque no hay quien cuente:
-- deja los conteos finales en null y eso es lo que despues se lee como
-- "no cerraron".

create extension if not exists pg_cron;

/**
 * Cierra el turno que haya quedado abierto de un dia anterior.
 *
 * La medianoche se calcula acá y no se toma del momento en que corre el job:
 * asi el turno queda cerrado a las 00:00 en punto aunque el cron arranque
 * tarde, o aunque `cron.timezone` no sea la que esperamos. Y por eso mismo el
 * turno abierto despues de esa medianoche no se toca: es el de hoy.
 */
create or replace function public.autocerrar_turno()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno public.turno_actual%rowtype;
  v_medianoche timestamptz :=
    date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
      at time zone 'America/Argentina/Buenos_Aires';
begin
  select * into v_turno from public.turno_actual;
  if not found or v_turno.abierto_en >= v_medianoche then
    return;
  end if;

  -- Sin cerrado_por: no lo cerro una persona. Sin caja_*_final: nadie conto.
  -- Lo esperado si se guarda, que es contra lo que se va a mirar despues.
  update public.turnos
     set cerrado_en = v_medianoche,
         caja_grande_esperada = v_turno.caja_grande_esperada,
         caja_chica_esperada = v_turno.caja_chica_esperada
   where id = v_turno.id;
end;
$$;

-- Solo el job la llama: desde el mostrador se cierra contando, no asi.
revoke execute on function public.autocerrar_turno() from public, authenticated;

-- 03:00 UTC son las 00:00 en Buenos Aires, que no cambia de hora en todo el año.
select cron.schedule('autocierre-turno', '0 3 * * *', 'select public.autocerrar_turno()');
