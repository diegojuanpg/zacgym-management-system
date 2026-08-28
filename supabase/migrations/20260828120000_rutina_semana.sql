-- La semana de entrenamiento que el alumno tiene abierta en su planilla.
--
-- No es lo mismo que `alumnos_tracking.ultima_rutina_semana`, que es la semana
-- que el pipeline de rutinas FIJO al avanzar. Esta se lee del archivo: es lo que
-- el alumno ve, que puede haberse corrido a mano o haber quedado atras si el
-- pipeline fallo. Tenerlas separadas es justamente lo que deja compararlas.
alter table public.alumnos
  add column rutina_semana date,
  -- Por que no hay fecha, cuando no la hay. "Revisar" es el caso que importa:
  -- dos bloques visibles a la vez, que suele ser una planilla a medio
  -- actualizar. Elegir uno de los dos inventaria un dato.
  add column rutina_estado text,
  add column rutina_leida_en timestamptz;

comment on column public.alumnos.rutina_semana is
  'Fecha del bloque visible en la planilla del alumno. La lee el pipeline semanaRutina.';
comment on column public.alumnos.rutina_estado is
  'Por que no se pudo leer la semana: Revisar (dos bloques visibles), o el error.';

-- La vista suma las tres al final: `create or replace` solo deja agregar.
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
          WHERE ventas.alumno_id = a.id AND ventas.anulada_en IS NULL) v ON true
     LEFT JOIN LATERAL ( SELECT sum(pg.monto) AS pagado,
            max(pg.creado_en) AS ultimo_pago
           FROM pagos pg
             JOIN ventas ve ON ve.id = pg.venta_id
          WHERE ve.alumno_id = a.id AND ve.anulada_en IS NULL) p ON true;

alter view public.alumnos_cuenta set (security_invoker = on);
grant select on public.alumnos_cuenta to authenticated;
