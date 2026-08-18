-- La venta sin cargo se salda con un pago 'no_paga' por el total: el saldo del
-- alumno queda en cero y el arqueo de caja no la ve, porque la caja esperada
-- solo suma los pagos en efectivo.
create or replace function public.registrar_ventas(p_items jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_item jsonb;
  v_producto public.productos%rowtype;
  v_cantidad smallint;
  v_venta_id uuid;
  v_efectivo integer;
  v_transferencia integer;
  v_no_paga integer;
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
    v_no_paga := coalesce((v_item ->> 'no_paga')::integer, 0);

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
    if v_no_paga > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_venta_id, v_no_paga, 'no_paga', auth.uid());
    end if;

    if v_producto.stock is not null then
      update public.productos set stock = stock - v_cantidad where id = v_producto.id;
    end if;

    v_cargadas := v_cargadas + 1;
  end loop;

  return v_cargadas;
end;
$$;

-- La columna nueva va al final: create or replace solo deja agregar.
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
         coalesce(sum(pg.monto) filter (where pg.metodo = 'no_paga'), 0)::integer as no_paga
    from public.ventas v
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id
    left join public.pagos pg on pg.venta_id = v.id
   group by v.id, a.nombre_completo, p.nombre, p.categoria;

alter view public.ventas_saldo set (security_invoker = on);
grant select on public.ventas_saldo to authenticated;
