-- Que se pueda cargar deuda y plata a favor a mano, sin turno abierto, y que
-- eso mueva el balance del alumno. Termina en rollback: no deja nada cargado.
--
--   pnpm test:cuenta

begin;
select set_config('request.jwt.claims',
                  json_build_object('sub', (select id::text from auth.users limit 1))::text, true);

-- Sin turno abierto a proposito: es el caso que antes no se podia cargar.
do $$ begin
  if exists (select 1 from public.turnos where cerrado_en is null) then
    perform public.cerrar_turno(0, 0, '[]'::jsonb, null);
  end if;
end $$;

create temp table t as select
  (select id from public.alumnos order by creado_en limit 1) as alumno,
  (select id from public.productos where activo order by precio desc limit 1) as producto;

create temp table antes as
  select saldo from public.alumnos_cuenta where id = (select alumno from t);

create temp table precio as
  select precio from public.productos where id = (select producto from t);

create or replace function pg_temp.chequear(p_caso text, p_esperado integer) returns void
language plpgsql as $$
declare v integer;
begin
  select saldo into v from public.alumnos_cuenta where id = (select alumno from t);
  if v is distinct from p_esperado then
    raise exception '% : esperaba saldo % y dio %', p_caso, p_esperado, v;
  end if;
  raise notice 'ok - %  (saldo %)', p_caso, v;
end $$;

-- Se llevo un producto y lo paga despues.
select public.cargar_deuda((select alumno from t), (select producto from t), 1::smallint);
select pg_temp.chequear('la deuda cargada a mano suma al balance',
                        (select antes.saldo + precio.precio from antes, precio));

-- Y esa venta cuenta: no es historico de la planilla.
do $$ begin
  if (select origen from public.ventas
       where alumno_id = (select alumno from t) order by creado_en desc limit 1) <> 'ajuste' then
    raise exception 'la venta cargada a mano tendria que quedar marcada como ajuste';
  end if;
end $$;

-- Le dejamos 5.000 a favor: baja el saldo y no entra plata a ninguna caja.
create temp table caja_antes as
  select coalesce(sum(monto), 0) as total from public.pagos
   where metodo in ('efectivo', 'transferencia');

select public.cargar_a_favor((select alumno from t), 5000);
select pg_temp.chequear('los 5.000 a favor bajan el balance',
                        (select antes.saldo + precio.precio - 5000 from antes, precio));

do $$ begin
  if (select coalesce(sum(monto), 0) from public.pagos
       where metodo in ('efectivo', 'transferencia')) <> (select total from caja_antes) then
    raise exception 'el ajuste a favor no tendria que mover plata de ninguna caja';
  end if;
end $$;

rollback;
