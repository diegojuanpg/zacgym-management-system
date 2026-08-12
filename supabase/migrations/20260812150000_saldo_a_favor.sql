-- Pagar de mas es normal en el mostrador: la cuota sale 43.750, el alumno da
-- 44.000 y no hay vuelto. Esos 250 quedan a favor suyo, no se pierden.
--
-- Se representan con el mismo mecanismo que la deuda: saldo = total - pagos.
--   saldo > 0  -> debe
--   saldo < 0  -> tiene a favor
-- Por eso las funciones dejan de rechazar el sobrepago.

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
  v_efectivo integer;
  v_transferencia integer;
  v_cargadas integer := 0;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no hay ventas para cargar';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::smallint, 1);
    v_efectivo := coalesce((v_item ->> 'efectivo')::integer, 0);
    v_transferencia := coalesce((v_item ->> 'transferencia')::integer, 0);

    if v_efectivo < 0 or v_transferencia < 0 then
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
      raise exception 'el producto % esta desactivado', v_producto.nombre;
    end if;

    insert into public.ventas (alumno_id, producto_id, cantidad, precio_unitario, creado_por)
    values ((v_item ->> 'alumno_id')::uuid, v_producto.id, v_cantidad, v_producto.precio, auth.uid())
    returning id into v_venta_id;

    if v_efectivo > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_venta_id, v_efectivo, 'efectivo', auth.uid());
    end if;
    if v_transferencia > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_venta_id, v_transferencia, 'transferencia', auth.uid());
    end if;

    if v_producto.stock is not null then
      update public.productos set stock = stock - v_cantidad where id = v_producto.id;
    end if;

    v_cargadas := v_cargadas + 1;
  end loop;

  return v_cargadas;
end;
$$;

create or replace function public.registrar_pago(
  p_venta_id uuid,
  p_monto integer,
  p_metodo public.metodo_pago
)
returns integer   -- saldo que queda: positivo debe, negativo a favor
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
  v_pagado integer;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if p_monto <= 0 then
    raise exception 'el monto tiene que ser mayor a cero';
  end if;

  select total into v_total
    from public.ventas
   where id = p_venta_id and anulada_en is null
   for update;
  if not found then
    raise exception 'la venta no existe o esta anulada';
  end if;

  insert into public.pagos (venta_id, monto, metodo, creado_por)
  values (p_venta_id, p_monto, p_metodo, auth.uid());

  select coalesce(sum(monto), 0) into v_pagado from public.pagos where venta_id = p_venta_id;
  return v_total - v_pagado;
end;
$$;

-- Cuenta corriente por alumno: lo que compro contra lo que entrego.
-- Es el lugar donde viven las deudas y los saldos a favor.
create view public.alumnos_cuenta as
  select a.id,
         a.nombre_completo,
         a.activo,
         coalesce(sum(v.total), 0)::integer as comprado,
         coalesce(sum(pg.pagado), 0)::integer as pagado,
         (coalesce(sum(v.total), 0) - coalesce(sum(pg.pagado), 0))::integer as saldo,
         greatest(coalesce(sum(v.total), 0) - coalesce(sum(pg.pagado), 0), 0)::integer as debe,
         greatest(coalesce(sum(pg.pagado), 0) - coalesce(sum(v.total), 0), 0)::integer as a_favor
    from public.alumnos a
    left join public.ventas v on v.alumno_id = a.id and v.anulada_en is null
    left join lateral (
      select coalesce(sum(p.monto), 0) as pagado from public.pagos p where p.venta_id = v.id
    ) pg on true
   group by a.id;

grant select on public.alumnos_cuenta to authenticated;
