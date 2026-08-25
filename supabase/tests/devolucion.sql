-- Que devolver plata baje el saldo a favor y salga del cajon una sola vez.
-- Corre contra la base local, adentro de una transaccion que termina en
-- rollback: no deja nada cargado.
--
--   pnpm test:devolucion
--
-- El caso real: la venta salio 45.000, pago con 50.000, no habia vuelto y los
-- 5.000 le quedaron a favor. Despues se los damos.

begin;
select set_config('request.jwt.claims',
                  json_build_object('sub', (select id::text from auth.users limit 1))::text, true);

do $$ begin
  if exists (select 1 from public.turnos where cerrado_en is null) then
    perform public.cerrar_turno(0, 0, '[]'::jsonb, null);
  end if;
  perform public.abrir_turno(0, 0, '[]'::jsonb);
end $$;

create temp table t as select
  (select id from public.alumnos order by creado_en limit 1) as alumno,
  (select id from public.productos where activo order by precio desc limit 1) as producto;

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

create or replace function pg_temp.devolver(p_monto integer) returns uuid
language sql as $$
  select public.registrar_movimiento('egreso', p_monto, 'Devolución', 'grande', 'efectivo',
                                     (select alumno from t));
$$;

-- Paga 5.000 de mas porque no habia vuelto.
select public.registrar_ventas(jsonb_build_array(jsonb_build_object(
  'alumno_id', (select alumno from t), 'producto_id', (select producto from t),
  'cantidad', 1, 'efectivo', (select precio + 5000 from precio),
  'transferencia', 0, 'no_paga', 0)));
select pg_temp.chequear('el vuelto que falto queda a favor', -5000);

create temp table caja_antes as
  select ventas_grande, movimientos_grande from public.turno_actual;

-- Se los devolvemos: el saldo a favor se apaga.
create temp table dev as select pg_temp.devolver(5000) as id;
select pg_temp.chequear('devolver apaga el saldo a favor', 0);

-- Y la venta queda pagada justa, sin quedar debiendo ni a favor.
do $$
declare v integer;
begin
  select count(*) filter (where saldo <> 0) into v
    from public.ventas_saldo where alumno_id = (select alumno from t);
  if v <> 0 then
    raise exception 'quedaron % ventas descuadradas', v;
  end if;
  raise notice 'ok - la venta queda pagada justa';
end $$;

-- La plata sale del cajon una sola vez: la baja la cuenta el egreso, y lo que
-- entro por ventas no se toca. Si el pago negativo fuera efectivo, el cajon
-- restaria los 5.000 dos veces.
do $$
declare v_ventas integer; v_movs integer; v_ventas_antes integer; v_movs_antes integer;
begin
  select ventas_grande, movimientos_grande into v_ventas, v_movs from public.turno_actual;
  select ventas_grande, movimientos_grande into v_ventas_antes, v_movs_antes from caja_antes;

  if v_ventas <> v_ventas_antes then
    raise exception 'la recaudacion del turno paso de % a %', v_ventas_antes, v_ventas;
  end if;
  if v_movs - v_movs_antes <> -5000 then
    raise exception 'el cajon se movio % en vez de -5000', v_movs - v_movs_antes;
  end if;
  raise notice 'ok - el cajon baja 5000 y la recaudacion no cambia';
end $$;

-- Borrar el egreso devuelve el saldo a favor: la plata volvio al cajon.
select public.borrar_movimiento((select id from dev));
select pg_temp.chequear('borrar el egreso devuelve el credito', -5000);

-- Devolver de mas es prestarle plata: el excedente le queda como deuda.
select pg_temp.devolver(7000);
select pg_temp.chequear('devolver de mas lo deja debiendo', 2000);

rollback;
