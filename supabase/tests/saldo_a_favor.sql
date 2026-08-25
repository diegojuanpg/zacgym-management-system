-- Que el saldo a favor se impute y se suelte bien. Corre contra la base local,
-- adentro de una transaccion que termina en rollback: no deja nada cargado.
--
--   pnpm test:credito
--
-- Cada paso compara el saldo de la cuenta del alumno contra lo que tiene que
-- dar. Si uno falla, corta con el numero que dio.

begin;
select set_config('request.jwt.claims',
                  json_build_object('sub', (select id::text from auth.users limit 1))::text, true);

-- Los pagos necesitan un turno abierto donde caer.
do $$ begin
  if exists (select 1 from public.turnos where cerrado_en is null) then
    perform public.cerrar_turno(0, 0, '[]'::jsonb, null);
  end if;
  perform public.abrir_turno(0, 0, '[]'::jsonb);
end $$;

create temp table t as select
  (select id from public.alumnos order by creado_en limit 1) as alumno,
  (select id from public.productos where activo order by precio desc limit 1) as caro,
  (select id from public.productos where activo order by precio limit 1) as barato;

create or replace function pg_temp.vender(p_producto uuid, p_efectivo integer) returns void
language sql as $$
  select public.registrar_ventas(jsonb_build_array(jsonb_build_object(
    'alumno_id', (select alumno from t), 'producto_id', p_producto,
    'cantidad', 1, 'efectivo', p_efectivo, 'transferencia', 0, 'no_paga', 0)));
$$;

create or replace function pg_temp.borrar(p_producto uuid) returns void
language sql as $$
  select public.borrar_venta((select id from public.ventas
    where alumno_id = (select alumno from t) and producto_id = p_producto limit 1));
$$;

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

create temp table precios as select
  (select precio from public.productos where id = (select caro from t)) as caro,
  (select precio from public.productos where id = (select barato from t)) as barato;

-- Paga 250 de mas: quedan a favor.
select pg_temp.vender((select caro from t), (select caro + 250 from precios));
select pg_temp.chequear('el sobrepago queda a favor', -250);

-- Compra algo y entrega 250 menos: los pone el saldo a favor.
select pg_temp.vender((select barato from t), (select barato - 250 from precios));
select pg_temp.chequear('la venta que usa el credito no queda debiendo', 0);

do $$
declare v_saldo integer;
begin
  select count(*) filter (where saldo <> 0) into v_saldo
    from public.ventas_saldo where alumno_id = (select alumno from t);
  if v_saldo <> 0 then
    raise exception 'quedaron % ventas descuadradas', v_saldo;
  end if;
  raise notice 'ok - ninguna venta queda con saldo suelto';
end $$;

-- La imputacion no es plata: el efectivo del turno no se movio.
do $$
declare v_efectivo integer; v_esperado integer;
begin
  select ventas_grande + ventas_chica into v_efectivo from public.turno_actual;
  select caro + barato into v_esperado from precios;
  if v_efectivo <> v_esperado then
    raise exception 'el turno cuenta % de efectivo y entraron %', v_efectivo, v_esperado;
  end if;
  raise notice 'ok - el efectivo del turno no cambia (%)', v_efectivo;
end $$;

-- Si se borra la venta que uso el credito, el credito vuelve.
select pg_temp.borrar((select barato from t));
select pg_temp.chequear('borrar la venta devuelve el credito', -250);

-- Si se borra la venta de donde salio, la otra vuelve a deber: esa plata ya no
-- existe.
select pg_temp.vender((select barato from t), (select barato - 250 from precios));
select pg_temp.borrar((select caro from t));
select pg_temp.chequear('sin respaldo, la venta vuelve a deber', 250);

rollback;
