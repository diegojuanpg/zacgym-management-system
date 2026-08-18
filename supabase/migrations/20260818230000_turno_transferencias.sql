-- Cuanto entro por transferencia en cada caja durante el turno.
--
-- En el cajon solo hay efectivo, por eso `caja_*_esperada` no las cuenta: si las
-- sumara, el cierre pediria plata que nunca estuvo. Pero para saber cuanto movio
-- la caja hacen falta las dos, asi que van en columnas aparte.
--
-- Las columnas nuevas se agregan al final: create or replace no deja meterlas
-- en el medio.
create or replace view public.turno_actual as
  select t.id,
         t.abierto_en,
         t.caja_grande_inicial,
         t.caja_chica_inicial,
         (t.caja_grande_inicial
          + coalesce((select sum(pg.monto)
                        from public.pagos pg
                        join public.ventas v on v.id = pg.venta_id
                        join public.productos p on p.id = v.producto_id
                       where pg.turno_id = t.id
                         and pg.metodo = 'efectivo'
                         and coalesce(p.caja, 'grande') = 'grande'), 0)
          + coalesce((select sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end)
                        from public.movimientos_caja m
                       where m.turno_id = t.id
                         and m.metodo = 'efectivo'
                         and m.caja = 'grande'
                         and m.anulado_en is null), 0))::integer as caja_grande_esperada,
         (t.caja_chica_inicial
          + coalesce((select sum(pg.monto)
                        from public.pagos pg
                        join public.ventas v on v.id = pg.venta_id
                        join public.productos p on p.id = v.producto_id
                       where pg.turno_id = t.id
                         and pg.metodo = 'efectivo'
                         and coalesce(p.caja, 'grande') = 'chica'), 0)
          + coalesce((select sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end)
                        from public.movimientos_caja m
                       where m.turno_id = t.id
                         and m.metodo = 'efectivo'
                         and m.caja = 'chica'
                         and m.anulado_en is null), 0))::integer as caja_chica_esperada,
         (select coalesce(array_agg(e.nombre order by e.nombre), '{}')
            from public.turno_responsables tr
            join public.empleados e on e.id = tr.empleado_id
           where tr.turno_id = t.id) as responsables,
         (coalesce((select sum(pg.monto)
                      from public.pagos pg
                      join public.ventas v on v.id = pg.venta_id
                      join public.productos p on p.id = v.producto_id
                     where pg.turno_id = t.id
                       and pg.metodo = 'transferencia'
                       and coalesce(p.caja, 'grande') = 'grande'), 0)
          + coalesce((select sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end)
                        from public.movimientos_caja m
                       where m.turno_id = t.id
                         and m.metodo = 'transferencia'
                         and m.caja = 'grande'
                         and m.anulado_en is null), 0))::integer as transferencia_grande,
         (coalesce((select sum(pg.monto)
                      from public.pagos pg
                      join public.ventas v on v.id = pg.venta_id
                      join public.productos p on p.id = v.producto_id
                     where pg.turno_id = t.id
                       and pg.metodo = 'transferencia'
                       and coalesce(p.caja, 'grande') = 'chica'), 0)
          + coalesce((select sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end)
                        from public.movimientos_caja m
                       where m.turno_id = t.id
                         and m.metodo = 'transferencia'
                         and m.caja = 'chica'
                         and m.anulado_en is null), 0))::integer as transferencia_chica
    from public.turnos t
   where t.cerrado_en is null;

alter view public.turno_actual set (security_invoker = on);
grant select on public.turno_actual to authenticated;
