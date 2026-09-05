-- Que un cobro apuntado a una compra entre en esa y no en la mas vieja.
-- Corre contra la base local, adentro de una transaccion que termina en
-- rollback: no deja nada cargado.
--
--   pnpm test:cobro
--
-- El caso real: el alumno debe la cuota de hace un mes y una creatina de ayer,
-- viene a pagar la creatina. Sin apuntar, la plata se iba a la cuota.

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
  (select id from public.productos where activo order by precio desc limit 1) as vieja,
  (select id from public.productos where activo order by precio limit 1) as nueva;

-- Las dos impagas: los tres montos en cero es "queda debiendo el total".
select public.registrar_ventas(jsonb_build_array(jsonb_build_object(
  'alumno_id', (select alumno from t), 'producto_id', (select vieja from t),
  'cantidad', 1, 'efectivo', 0, 'transferencia', 0, 'no_paga', 0)));
select public.registrar_ventas(jsonb_build_array(jsonb_build_object(
  'alumno_id', (select alumno from t), 'producto_id', (select nueva from t),
  'cantidad', 1, 'efectivo', 0, 'transferencia', 0, 'no_paga', 0)));

create temp table compras as
  select (select id from public.ventas
           where alumno_id = (select alumno from t) and producto_id = (select vieja from t)
           order by creado_en desc limit 1) as venta_vieja,
         (select id from public.ventas
           where alumno_id = (select alumno from t) and producto_id = (select nueva from t)
           order by creado_en desc limit 1) as venta_nueva;

create or replace function pg_temp.chequear(p_caso text, p_venta uuid, p_esperado integer)
returns void language plpgsql as $$
declare v integer;
begin
  select saldo into v from public.ventas_saldo where id = p_venta;
  if v is distinct from p_esperado then
    raise exception '% : esperaba deber % y dio %', p_caso, p_esperado, v;
  end if;
  raise notice 'ok - %  (debe %)', p_caso, v;
end $$;

-- Paga la nueva, apuntando a ella.
select public.registrar_cobro(
  (select alumno from t),
  (select total from public.ventas where id = (select venta_nueva from compras)),
  0, null, null,
  (select venta_nueva from compras));

select pg_temp.chequear('la compra que pago queda saldada',
                        (select venta_nueva from compras), 0);
select pg_temp.chequear('la vieja sigue impaga',
                        (select venta_vieja from compras),
                        (select total from public.ventas where id = (select venta_vieja from compras)));

-- Sin apuntar sigue siendo FIFO: esta plata si va a la mas vieja.
select public.registrar_cobro(
  (select alumno from t),
  (select total from public.ventas where id = (select venta_vieja from compras)),
  0);
select pg_temp.chequear('sin apuntar, la plata va a la mas vieja',
                        (select venta_vieja from compras), 0);

rollback;
