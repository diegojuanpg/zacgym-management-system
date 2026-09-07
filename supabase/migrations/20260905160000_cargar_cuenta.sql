-- Cargarle a mano una deuda o plata a favor desde la ficha del alumno.
--
-- Hasta ahora la unica forma de que un alumno debiera algo era venderselo en el
-- mostrador, con turno abierto. Pero la deuda aparece cuando aparece —"se llevo
-- un suplemento y me lo paga la semana que viene"— y quien la anota esta en
-- Alumnos, a las once de la noche, sin turno.
--
-- Eso choca con una cosa: hasta hoy "sin turno" significaba "importada de la
-- planilla vieja", y esas no entran en el balance. Con ajustes cargados fuera
-- de turno esa marca deja de alcanzar, asi que el origen pasa a estar escrito.
alter table public.ventas add column if not exists origen text not null default 'app';

update public.ventas set origen = 'planilla' where turno_id is null and origen = 'app';

alter table public.ventas drop constraint if exists ventas_origen_check;
alter table public.ventas add constraint ventas_origen_check
  check (origen in ('app', 'planilla', 'ajuste'));

comment on column public.ventas.origen is
  'De donde salio la venta: app (mostrador), planilla (historico importado, no entra en el balance) o ajuste (cargada a mano desde la ficha, sin turno).';

-- Un ajuste no tiene turno: se carga cuando se carga. El pago a_favor tampoco,
-- y no pasa por ninguna caja. Todo lo demas sigue necesitando turno abierto.
create or replace function public.sellar_turno()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turno uuid;
begin
  if new.turno_id is not null then
    return new;
  end if;

  select id into v_turno from public.turnos where cerrado_en is null;
  if v_turno is not null then
    new.turno_id := v_turno;
    return new;
  end if;

  if tg_table_name = 'ventas' then
    if new.origen = 'ajuste' then
      return new;
    end if;
  elsif tg_table_name = 'pagos' then
    if new.metodo::text = 'a_favor' then
      return new;
    end if;
  end if;

  raise exception 'no hay un turno abierto: inicia turno para cargar movimientos';
end;
$$;

-- El balance mira el origen y no el turno: un ajuste sin turno cuenta, una
-- venta de la planilla no.
create or replace view public.ventas_saldo as
  select v.id,
         v.alumno_id,
         a.nombre_completo as alumno,
         v.producto_id,
         p.nombre as producto,
         v.cantidad,
         v.precio_unitario,
         v.total,
         v.creado_en,
         v.creado_por,
         v.anulada_en,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'efectivo'::metodo_pago), 0::bigint)::integer as efectivo,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'transferencia'::metodo_pago), 0::bigint)::integer as transferencia,
         coalesce(sum(pg.monto), 0::bigint)::integer as pagado,
         (v.total - coalesce(sum(pg.monto), 0::bigint))::integer as saldo,
         p.categoria,
         v.turno_id,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'no_paga'::metodo_pago), 0::bigint)::integer as no_paga,
         coalesce(sum(pg.monto) filter (where pg.metodo::text = 'a_favor'::text), 0::bigint)::integer as a_favor,
         v.cargada_sheet_en,
         v.cargada_app_en,
         v.origen
    from ventas v
    join alumnos a on a.id = v.alumno_id
    join productos p on p.id = v.producto_id
    left join pagos pg on pg.venta_id = v.id
   group by v.id, a.nombre_completo, p.nombre, p.categoria;

alter view public.ventas_saldo set (security_invoker = on);
grant select on public.ventas_saldo to authenticated;

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
            AND ventas.origen <> 'planilla') v ON true
     LEFT JOIN LATERAL ( SELECT sum(pg.monto) AS pagado,
            max(pg.creado_en) AS ultimo_pago
           FROM pagos pg
             JOIN ventas ve ON ve.id = pg.venta_id
          WHERE ve.alumno_id = a.id AND ve.anulada_en IS NULL
            AND ve.origen <> 'planilla') p ON true;

alter view public.alumnos_cuenta set (security_invoker = on);
grant select on public.alumnos_cuenta to authenticated;

/**
 * Le carga a mano una compra impaga: el suplemento que se llevo y todavia no
 * pago. Es una venta como cualquier otra —se cobra desde el mostrador, aparece
 * en su ficha— salvo que no tiene turno y no toca el stock: la cosa ya salio
 * del estante cuando se la llevo, no ahora que alguien la anota.
 */
create or replace function public.cargar_deuda(
  p_alumno_id uuid,
  p_producto_id uuid,
  p_cantidad smallint default 1
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_venta_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if coalesce(p_cantidad, 0) < 1 then
    raise exception 'la cantidad tiene que ser mayor a cero';
  end if;

  select * into v_producto from public.productos where id = p_producto_id;
  if not found then
    raise exception 'producto inexistente';
  end if;

  insert into public.ventas
    (alumno_id, producto_id, cantidad, precio_unitario, creado_por, origen)
  values
    (p_alumno_id, v_producto.id, p_cantidad, v_producto.precio, auth.uid(), 'ajuste')
  returning id into v_venta_id;

  -- Si tenia plata a favor, se le descuenta sola: es la misma regla que en el
  -- mostrador.
  perform public.aplicar_a_favor(p_alumno_id, v_venta_id);

  return v_venta_id;
end;
$$;

grant execute on function public.cargar_deuda(uuid, uuid, smallint) to authenticated;

/**
 * Le deja plata a favor sin que entre plata a ninguna caja: es un ajuste de la
 * cuenta, no un cobro. Se escribe como un pago 'a_favor' sobre su ultima
 * compra, que es donde vive cualquier excedente, y de ahi lo toma la proxima
 * venta igual que si hubiera pagado de mas.
 */
create or replace function public.cargar_a_favor(p_alumno_id uuid, p_monto integer)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venta uuid;
  v_pago uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'el monto tiene que ser mayor a cero';
  end if;

  select id into v_venta
    from public.ventas
   where alumno_id = p_alumno_id and anulada_en is null and origen <> 'planilla'
   order by creado_en desc
   limit 1;
  if v_venta is null then
    raise exception 'el alumno todavia no tiene compras: cargale la deuda primero';
  end if;

  insert into public.pagos (venta_id, monto, metodo, creado_por)
  values (v_venta, p_monto, 'a_favor', auth.uid())
  returning id into v_pago;

  return v_pago;
end;
$$;

grant execute on function public.cargar_a_favor(uuid, integer) to authenticated;
