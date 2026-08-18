-- Incoherencias pasa a listar todos los turnos, no solo los que no cuadraron:
-- para eso hay que poder distinguir "conto y dio bien" de "no conto nada", que
-- con solo las diferencias no se ve.
create or replace view public.turnos_cerrados as
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
         (select coalesce(array_agg(e.nombre order by e.nombre), '{}')
            from public.turno_responsables tr
            join public.empleados e on e.id = tr.empleado_id
           where tr.turno_id = t.id) as responsables,
         (select count(*)::integer
            from public.turno_stock ts
           where ts.turno_id = t.id and ts.momento = 'cierre') as contados
    from public.turnos t
   where t.cerrado_en is not null;

alter view public.turnos_cerrados set (security_invoker = on);
grant select on public.turnos_cerrados to authenticated;
