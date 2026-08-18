-- Lo que no cuadro, para mirarlo despues.
--
-- Los datos ya estaban (turnos guarda el conteo de caja, turno_stock el de cada
-- producto); esto solo los deja listos para leer sin rearmar el join en cada
-- pantalla. Dos preguntas distintas: de que turno fue, y que producto viene
-- desapareciendo. La segunda es la que detecta un robo sistematico: un faltante
-- suelto es un error de conteo, el mismo producto faltando seis veces no.

/** Un turno cerrado con sus diferencias de caja. */
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
           where tr.turno_id = t.id) as responsables
    from public.turnos t
   where t.cerrado_en is not null;

/**
 * Cada conteo de stock que no dio. El momento importa: una diferencia en la
 * apertura viene de antes de ese turno, una en el cierre paso durante.
 */
create or replace view public.diferencias_stock as
  select ts.turno_id,
         ts.momento,
         ts.producto_id,
         p.nombre as producto,
         p.precio,
         ts.contado,
         ts.esperado,
         (ts.contado - ts.esperado) as diferencia,
         -- Lo que cuesta el faltante: una proteina pesa lo que 69 aguas.
         ((ts.contado - ts.esperado) * p.precio) as valor,
         t.abierto_en,
         t.cerrado_en,
         (select coalesce(array_agg(e.nombre order by e.nombre), '{}')
            from public.turno_responsables tr
            join public.empleados e on e.id = tr.empleado_id
           where tr.turno_id = t.id) as responsables
    from public.turno_stock ts
    join public.productos p on p.id = ts.producto_id
    join public.turnos t on t.id = ts.turno_id
   where ts.contado <> ts.esperado;

grant select on public.turnos_cerrados, public.diferencias_stock to authenticated;
