-- Las tarjetas de caja pasan a decir de donde sale el numero: con cuanto se
-- abrio, cuanto entro por ventas y cobros y cuanto movieron los movimientos.
--
-- Se van transferencia_grande y transferencia_chica, que duraron una tarde: en
-- el cajon solo hay efectivo, y mezclar las transferencias con lo que hay que
-- contar al cerrar confundia mas de lo que sumaba.
--
-- Drop y create, no replace: replace solo deja agregar columnas al final.
-- cerrar_turno la lee con %rowtype, que se resuelve al ejecutar, asi que no
-- hace falta tocar la funcion.
drop view if exists public.turno_actual;

create view public.turno_actual as
  select t.id,
         t.abierto_en,
         t.caja_grande_inicial,
         t.caja_chica_inicial,
         v.grande as ventas_grande,
         v.chica as ventas_chica,
         m.grande as movimientos_grande,
         m.chica as movimientos_chica,
         (t.caja_grande_inicial + v.grande + m.grande)::integer as caja_grande_esperada,
         (t.caja_chica_inicial + v.chica + m.chica)::integer as caja_chica_esperada,
         (select coalesce(array_agg(e.nombre order by e.nombre), '{}')
            from public.turno_responsables tr
            join public.empleados e on e.id = tr.empleado_id
           where tr.turno_id = t.id) as responsables
    from public.turnos t
    -- Lo cobrado en efectivo, a la caja que le toca a cada producto. Entran
    -- tambien los cobros de deuda: el pago es de este turno aunque la venta
    -- sea vieja.
    cross join lateral (
      select coalesce(sum(pg.monto) filter (where coalesce(p.caja, 'grande') = 'grande'), 0)::integer as grande,
             coalesce(sum(pg.monto) filter (where coalesce(p.caja, 'grande') = 'chica'), 0)::integer as chica
        from public.pagos pg
        join public.ventas ve on ve.id = pg.venta_id
        join public.productos p on p.id = ve.producto_id
       where pg.turno_id = t.id and pg.metodo = 'efectivo'
    ) v
    cross join lateral (
      select coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end)
                        filter (where mc.caja = 'grande'), 0)::integer as grande,
             coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end)
                        filter (where mc.caja = 'chica'), 0)::integer as chica
        from public.movimientos_caja mc
       where mc.turno_id = t.id and mc.metodo = 'efectivo' and mc.anulado_en is null
    ) m
   where t.cerrado_en is null;

alter view public.turno_actual set (security_invoker = on);
grant select on public.turno_actual to authenticated;
