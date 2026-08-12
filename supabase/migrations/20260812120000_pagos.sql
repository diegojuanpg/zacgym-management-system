-- Una venta puede recibir mas de un pago: mixto (parte efectivo, parte
-- transferencia) y parcial (paga menos que el total y queda debiendo).
--
-- El saldo no es un campo que alguien marca: es total - suma de pagos. Por eso
-- no puede quedar desincronizado, que es donde se rompe la hoja actual.
-- "Fiado" deja de ser un metodo: es una venta sin pagos.

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas on delete cascade,
  monto integer not null check (monto > 0),
  metodo public.metodo_pago not null,
  creado_por uuid not null references auth.users on delete restrict,
  creado_en timestamptz not null default now()
);

create index pagos_venta_idx on public.pagos (venta_id);
create index pagos_fecha_idx on public.pagos (creado_en desc);

-- Las ventas ya cargadas: las cobradas pasan a tener su pago por el total, las
-- fiadas se quedan sin ninguno.
insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en)
select id, total, metodo::text::public.metodo_pago, creado_por, creado_en
  from public.ventas
 where metodo <> 'fiado' and anulada_en is null;

alter table public.ventas drop column metodo;

-- 'fiado' sale del enum: ahora se representa por ausencia de pagos.
alter type public.metodo_pago rename to metodo_pago_viejo;
create type public.metodo_pago as enum ('efectivo', 'transferencia');
alter table public.pagos
  alter column metodo type public.metodo_pago using metodo::text::public.metodo_pago;
drop type public.metodo_pago_viejo;

create view public.ventas_saldo as
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
         (v.total - coalesce(sum(pg.monto), 0))::integer as saldo
    from public.ventas v
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id
    left join public.pagos pg on pg.venta_id = v.id
   group by v.id, a.nombre_completo, p.nombre;

-- Cada item: {alumno_id, producto_id, cantidad, efectivo, transferencia}.
-- Los dos montos en 0 = queda debiendo el total.
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
  v_total integer;
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

    v_total := v_producto.precio * v_cantidad;
    if v_efectivo + v_transferencia > v_total then
      raise exception 'el pago (%) supera el total de la venta (%)',
        v_efectivo + v_transferencia, v_total;
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

-- Cobrar contra una venta que quedo con saldo.
create or replace function public.registrar_pago(
  p_venta_id uuid,
  p_monto integer,
  p_metodo public.metodo_pago
)
returns integer   -- saldo que queda
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

  select coalesce(sum(monto), 0) into v_pagado from public.pagos where venta_id = p_venta_id;

  if p_monto > v_total - v_pagado then
    raise exception 'el pago (%) supera el saldo (%)', p_monto, v_total - v_pagado;
  end if;

  insert into public.pagos (venta_id, monto, metodo, creado_por)
  values (p_venta_id, p_monto, p_metodo, auth.uid());

  return v_total - v_pagado - p_monto;
end;
$$;

-- Anular arrastra los pagos (on delete cascade) y devuelve el stock.
create or replace function public.anular_venta(p_venta_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
begin
  select * into v_venta
    from public.ventas
   where id = p_venta_id and anulada_en is null
   for update;
  if not found then
    raise exception 'la venta no existe o ya estaba anulada';
  end if;

  update public.ventas
     set anulada_en = now(), anulada_por = auth.uid()
   where id = p_venta_id;

  delete from public.pagos where venta_id = p_venta_id;

  update public.productos
     set stock = stock + v_venta.cantidad
   where id = v_venta.producto_id and stock is not null;
end;
$$;

alter table public.pagos enable row level security;

create policy staff_lee on public.pagos for select to authenticated using (true);
create policy staff_carga_pagos on public.pagos for insert to authenticated
  with check (creado_por = auth.uid());
create policy staff_borra_pagos on public.pagos for delete to authenticated using (true);

grant select, insert, delete on public.pagos to authenticated;
grant select on public.ventas_saldo to authenticated;
