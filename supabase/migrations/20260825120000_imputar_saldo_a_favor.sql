-- Usar el saldo a favor no dejaba rastro en la venta. El mostrador descontaba
-- los $250 que el alumno tenia a favor de lo que habia que cobrarle, pero la
-- venta nueva quedaba sin ningun pago: la fila mostraba "Debe 250" para siempre
-- y la venta vieja seguia con los $250 de mas colgados.
--
-- La cuenta del alumno cerraba igual —el saldo es comprado menos pagado— pero
-- venta por venta el numero era mentira, que es lo que se mira en el mostrador
-- y en la ficha.
--
-- Ahora la imputacion queda escrita, y como asiento doble: un pago 'a_favor'
-- positivo en la venta nueva y su contrapartida negativa en la venta donde
-- habia quedado el excedente. Los dos suman cero, asi que la cuenta del alumno
-- no se mueve, y como 'a_favor' no es efectivo ninguna caja lo cuenta: la plata
-- entro cuando pago de mas, no ahora.

alter type public.metodo_pago add value if not exists 'a_favor';

-- La contrapartida es negativa: no entra plata, se reparte una que ya estaba.
alter table public.pagos drop constraint pagos_monto_check;
alter table public.pagos add constraint pagos_monto_check check (monto <> 0);

-- El asiento negativo cuelga del positivo: si se borra la venta nueva —y con
-- ella su pago— el credito vuelve solo a la venta de donde salio.
alter table public.pagos
  add column contraparte_id uuid references public.pagos(id) on delete cascade;

comment on column public.pagos.contraparte_id is
  'Asiento espejo de una imputacion de saldo a favor. Solo lo usan los pagos a_favor.';

/**
 * Le imputa a una venta lo que el alumno tenia a favor, de la venta mas vieja
 * a la mas nueva. Devuelve cuanto uso.
 *
 * Se llama sola al cargar la venta: si el alumno tiene plata a favor no hay
 * razon para que la venta figure impaga.
 */
create or replace function public.aplicar_a_favor(p_alumno_id uuid, p_venta_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_resto integer;
  v_credito record;
  v_aplicar integer;
  v_pago_id uuid;
  v_usado integer := 0;
begin
  -- Lo que falta cobrar de la venta recien cargada.
  select v.total - coalesce((select sum(pg.monto) from public.pagos pg where pg.venta_id = v.id), 0)
    into v_resto
    from public.ventas v
   where v.id = p_venta_id;

  if coalesce(v_resto, 0) <= 0 then
    return 0;
  end if;

  -- Las ventas del alumno donde quedo plata de mas, de la mas vieja a la mas
  -- nueva: es el mismo orden con el que se imputa un cobro de deuda.
  for v_credito in
    select v.id,
           (sum(pg.monto) - v.total)::integer as sobra
      from public.ventas v
      join public.pagos pg on pg.venta_id = v.id
     where v.alumno_id = p_alumno_id
       and v.anulada_en is null
       and v.id <> p_venta_id
     group by v.id, v.total, v.creado_en
    having sum(pg.monto) > v.total
     order by v.creado_en
  loop
    exit when v_resto <= 0;
    v_aplicar := least(v_resto, v_credito.sobra);

    insert into public.pagos (venta_id, monto, metodo, creado_por)
    values (p_venta_id, v_aplicar, 'a_favor', auth.uid())
    returning id into v_pago_id;

    insert into public.pagos (venta_id, monto, metodo, creado_por, contraparte_id)
    values (v_credito.id, -v_aplicar, 'a_favor', auth.uid(), v_pago_id);

    v_resto := v_resto - v_aplicar;
    v_usado := v_usado + v_aplicar;
  end loop;

  return v_usado;
end;
$$;

grant execute on function public.aplicar_a_favor(uuid, uuid) to authenticated;

-- Igual que estaba, con la imputacion del saldo a favor al final de cada venta.
create or replace function public.registrar_ventas(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_producto public.productos%rowtype;
  v_cantidad smallint;
  v_venta_id uuid;
  v_alumno_id uuid;
  v_efectivo integer;
  v_transferencia integer;
  v_no_paga integer;
  v_cargadas integer := 0;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no hay ventas para cargar';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::smallint, 1);
    v_efectivo := coalesce((v_item ->> 'efectivo')::integer, 0);
    v_transferencia := coalesce((v_item ->> 'transferencia')::integer, 0);
    v_no_paga := coalesce((v_item ->> 'no_paga')::integer, 0);
    v_alumno_id := (v_item ->> 'alumno_id')::uuid;

    if v_efectivo < 0 or v_transferencia < 0 or v_no_paga < 0 then
      raise exception 'los montos no pueden ser negativos';
    end if;

    select * into v_producto
      from public.productos
     where id = (v_item ->> 'producto_id')::uuid
     for update;

    if not found then
      raise exception 'producto inexistente';
    end if;
    if not v_producto.activo then
      raise exception 'el producto % está desactivado', v_producto.nombre;
    end if;

    insert into public.ventas (alumno_id, producto_id, cantidad, precio_unitario, creado_por)
    values (v_alumno_id, v_producto.id, v_cantidad, v_producto.precio, auth.uid())
    returning id into v_venta_id;

    if v_efectivo > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_venta_id, v_efectivo, 'efectivo', auth.uid());
    end if;
    if v_transferencia > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_venta_id, v_transferencia, 'transferencia', auth.uid());
    end if;
    if v_no_paga > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_venta_id, v_no_paga, 'no_paga', auth.uid());
    end if;

    -- Lo que tenia a favor se descuenta acá, no en la pantalla: el mostrador ya
    -- cobraba de menos, faltaba que la venta lo dijera.
    perform public.aplicar_a_favor(v_alumno_id, v_venta_id);

    if v_producto.stock is not null then
      update public.productos set stock = stock - v_cantidad where id = v_producto.id;
    end if;

    v_cargadas := v_cargadas + 1;
  end loop;

  return v_cargadas;
end;
$$;

-- La venta suma cuánto se pagó con saldo a favor, para que la fila no quede con
-- método vacío. Los literales van casteados a texto porque el valor del enum se
-- agregó en esta misma transacción.
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
         coalesce(sum(pg.monto) filter (where pg.metodo = 'efectivo'), 0)::integer as efectivo,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'transferencia'), 0)::integer as transferencia,
         coalesce(sum(pg.monto), 0)::integer as pagado,
         (v.total - coalesce(sum(pg.monto), 0))::integer as saldo,
         p.categoria,
         v.turno_id,
         coalesce(sum(pg.monto) filter (where pg.metodo = 'no_paga'), 0)::integer as no_paga,
         coalesce(sum(pg.monto) filter (where pg.metodo::text = 'a_favor'), 0)::integer as a_favor
    from public.ventas v
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id
    left join public.pagos pg on pg.venta_id = v.id
   group by v.id, a.nombre_completo, p.nombre, p.categoria;

-- La imputación no es recaudación: la plata se contó el día que entró.
create or replace view public.ventas_por_dia as
  select (pg.creado_en at time zone 'America/Argentina/Buenos_Aires')::date as dia,
         case
           when (pg.creado_en at time zone 'America/Argentina/Buenos_Aires')::date
                <> (pg.venta_creada_en at time zone 'America/Argentina/Buenos_Aires')::date
             then 'cobro'
           else coalesce(pg.categoria, 'sin')
         end as rubro,
         sum(pg.monto)::integer as monto
    from public.pagos_detalle pg
   where pg.anulada_en is null
     and pg.metodo::text not in ('no_paga', 'a_favor')
   group by 1, 2;

/**
 * Si se cae la plata que respaldaba una imputacion, se cae la imputacion.
 *
 * Pasa por dos lados: se borra la venta donde habia quedado el saldo a favor
 * —y con ella el asiento negativo— o se borra el pago que dejo ese saldo. En
 * los dos casos la venta que uso el credito tiene que volver a figurar impaga,
 * que es la verdad: esa plata ya no existe.
 *
 * El camino inverso lo cubre la foreign key: borrar la venta que uso el credito
 * borra el asiento positivo y con el, en cascada, el negativo.
 */
create or replace function public.soltar_a_favor()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.monto < 0 then
    delete from public.pagos where id = old.contraparte_id;
  else
    -- Se fue plata de esta venta: las imputaciones que salieron de acá quedan
    -- sin respaldo. Se sueltan todas, aunque sobrara para cubrir alguna: es una
    -- correccion a mano y arreglar de mas es peor que dejarlo pendiente.
    delete from public.pagos where venta_id = old.venta_id and monto < 0;
  end if;
  return null;
end;
$$;

create trigger pagos_soltar_a_favor
  after delete on public.pagos
  for each row execute function public.soltar_a_favor();
