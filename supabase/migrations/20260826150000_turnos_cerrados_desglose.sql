-- El detalle de un turno cerrado necesita de donde sale el numero esperado, no
-- solo el numero. Es el mismo desglose que ya muestra `turno_actual` para el
-- turno abierto —con cuanto se abrio, cuanto entro por ventas y cobros, cuanto
-- movieron los movimientos— pero para los que ya cerraron.
--
-- Drop y create, no replace: replace solo deja agregar columnas al final.
drop view if exists public.turnos_cerrados;

create view public.turnos_cerrados as
  select t.id,
         t.abierto_en,
         t.cerrado_en,
         t.caja_grande_inicial,
         t.caja_chica_inicial,
         t.caja_grande_final,
         t.caja_chica_final,
         t.caja_grande_esperada,
         t.caja_chica_esperada,
         (t.caja_grande_final - t.caja_grande_esperada) as dif_grande,
         (t.caja_chica_final - t.caja_chica_esperada) as dif_chica,
         t.nota_cierre,
         r.nombres as responsables,
         r.detalle as responsables_detalle,
         (select count(*)::integer
            from public.turno_stock ts
           where ts.turno_id = t.id and ts.momento = 'cierre') as contados,
         v.grande as ventas_grande,
         v.chica as ventas_chica,
         m.grande as movimientos_grande,
         m.chica as movimientos_chica
    from public.turnos t
    cross join lateral public.responsables_entre(t.abierto_en, t.cerrado_en) r
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
   where t.cerrado_en is not null;

alter view public.turnos_cerrados set (security_invoker = on);
grant select on public.turnos_cerrados to authenticated;
