-- El balance del alumno tiene que salir solo de lo que se cargo en esta app.
-- Las 5657 ventas del historico de la planilla —las que metio
-- `scripts/importar-hoja-madre.mjs`— arrastraban deudas y saldos a favor del
-- sistema viejo, y esa plata ya no se cobra ni se devuelve.
--
-- La marca del historico es `turno_id is null`: la importacion apago
-- `ventas_sella_turno` para poder escribirlo, y toda venta cargada desde el
-- mostrador sale sellada con el turno abierto.
--
-- El filtro va por la venta, no por el pago: una deuda vieja que despues se
-- cobro en el mostrador queda cobrada y punto, no se convierte en saldo a
-- favor. La plata sigue contada donde corresponde —caja y turnos miran
-- `pagos_detalle`, que no cambia—, lo unico que se va es el arrastre.
create or replace view public.alumnos_cuenta as
SELECT a.id,
    a.nombre_completo,
    a.apellido,
    a.nombre,
    COALESCE(a.celular, t.numero) AS celular,
    COALESCE(a.email, t.gmail) AS email,
    a.sheet_id,
    COALESCE(a.nacimiento, t.nacimiento) AS nacimiento,
    COALESCE(a.genero,
        CASE upper(t.sexo)
            WHEN 'FEMALE'::text THEN 'femenino'::text
            WHEN 'MALE'::text THEN 'masculino'::text
            ELSE NULL::text
        END::genero) AS genero,
    COALESCE(t.vencimiento::date, a.vence) AS vence,
    a.activo,
    EXTRACT(year FROM age(COALESCE(a.nacimiento, t.nacimiento)::timestamp with time zone))::integer AS edad,
    COALESCE(v.comprado, 0::bigint)::integer AS comprado,
    COALESCE(p.pagado, 0::bigint)::integer AS pagado,
    (COALESCE(v.comprado, 0::bigint) - COALESCE(p.pagado, 0::bigint))::integer AS saldo,
    GREATEST(COALESCE(v.comprado, 0::bigint) - COALESCE(p.pagado, 0::bigint), 0::bigint)::integer AS debe,
    GREATEST(COALESCE(p.pagado, 0::bigint) - COALESCE(v.comprado, 0::bigint), 0::bigint)::integer AS a_favor,
    t.ultimo_checkin AS ultima_actividad,
    a.creado_en,
    a.tracking_id,
    t.estado AS estado_membresia,
    t.ultimo_checkin,
    t.dias_entrenamiento,
    a.rutina_semana,
    a.rutina_estado,
    a.rutina_leida_en
   FROM alumnos a
     LEFT JOIN LATERAL ( SELECT tr.id,
            tr.nombre,
            tr.gmail,
            tr.numero,
            tr.sheet_id,
            tr.dias_entrenamiento,
            tr.ultimo_checkin,
            tr.vencimiento,
            tr.estado,
            tr.activo,
            tr.updated_at,
            tr.ultima_rutina_semana,
            tr.sexo,
            tr.nacimiento
           FROM alumnos_tracking tr
          WHERE tr.id = a.tracking_id OR a.email IS NOT NULL AND lower(TRIM(BOTH FROM tr.gmail)) = lower(TRIM(BOTH FROM a.email))
          ORDER BY (tr.id = a.tracking_id) DESC
         LIMIT 1) t ON true
     LEFT JOIN LATERAL ( SELECT sum(ventas.total) AS comprado,
            max(ventas.creado_en) AS ultima_compra
           FROM ventas
          WHERE ventas.alumno_id = a.id AND ventas.anulada_en IS NULL
            AND ventas.turno_id IS NOT NULL) v ON true
     LEFT JOIN LATERAL ( SELECT sum(pg.monto) AS pagado,
            max(pg.creado_en) AS ultimo_pago
           FROM pagos pg
             JOIN ventas ve ON ve.id = pg.venta_id
          WHERE ve.alumno_id = a.id AND ve.anulada_en IS NULL
            AND ve.turno_id IS NOT NULL) p ON true;

alter view public.alumnos_cuenta set (security_invoker = on);
grant select on public.alumnos_cuenta to authenticated;
