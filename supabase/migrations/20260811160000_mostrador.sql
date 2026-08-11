-- Mostrador: alumnos, productos y ventas.
--
-- Una venta = una linea (un producto, un alumno, un metodo), igual que en la hoja
-- Novedades. El lote que se arma en el modal entra como N filas en una sola
-- transaccion, asi no queda medio cargado si algo falla.
--
-- Plata en enteros (pesos, sin centavos).

create type public.metodo_pago as enum ('efectivo', 'transferencia', 'fiado');

create or replace function public.es_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

create table public.alumnos (
  id uuid primary key default gen_random_uuid(),
  apellido text not null,
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  nombre_completo text generated always as (apellido || ', ' || nombre) stored,
  unique (apellido, nombre)
);

create index alumnos_nombre_idx on public.alumnos (nombre_completo);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  precio integer not null check (precio >= 0),
  -- null = no se controla stock (cuotas, pases, servicios).
  stock integer,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos on delete restrict,
  producto_id uuid not null references public.productos on delete restrict,
  cantidad smallint not null default 1 check (cantidad > 0),
  -- Precio congelado: tocar el catalogo despues no reescribe lo ya vendido.
  precio_unitario integer not null check (precio_unitario >= 0),
  total integer generated always as (cantidad * precio_unitario) stored,
  metodo public.metodo_pago not null,
  creado_por uuid not null references auth.users on delete restrict,
  creado_en timestamptz not null default now(),
  anulada_en timestamptz,
  anulada_por uuid references auth.users on delete restrict
);

create index ventas_fecha_idx on public.ventas (creado_en desc);

-- Carga el lote entero del modal. Cada item: {producto_id, alumno_id, cantidad, metodo}.
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

    insert into public.ventas (alumno_id, producto_id, cantidad, precio_unitario, metodo, creado_por)
    values (
      (v_item ->> 'alumno_id')::uuid,
      v_producto.id,
      v_cantidad,
      v_producto.precio,
      (v_item ->> 'metodo')::public.metodo_pago,
      auth.uid()
    );

    if v_producto.stock is not null then
      update public.productos set stock = stock - v_cantidad where id = v_producto.id;
    end if;

    v_cargadas := v_cargadas + 1;
  end loop;

  return v_cargadas;
end;
$$;

-- Anular deja rastro y devuelve el stock. Nunca se borra una venta.
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

  update public.productos
     set stock = stock + v_venta.cantidad
   where id = v_venta.producto_id and stock is not null;
end;
$$;

-- ============================== permisos ==============================

alter table public.alumnos enable row level security;
alter table public.productos enable row level security;
alter table public.ventas enable row level security;

create policy staff_lee on public.alumnos   for select to authenticated using (true);
create policy staff_lee on public.productos for select to authenticated using (true);
create policy staff_lee on public.ventas    for select to authenticated using (true);

-- El alta de alumnos es del mostrador; el catalogo lo toca solo un admin.
create policy staff_crea_alumnos on public.alumnos for insert to authenticated with check (true);
create policy admin_edita_alumnos on public.alumnos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy admin_catalogo on public.productos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Las ventas se cargan a nombre propio y se anulan via RPC (de ahi el update).
create policy staff_carga_ventas on public.ventas for insert to authenticated
  with check (creado_por = auth.uid());
create policy staff_anula_ventas on public.ventas for update to authenticated
  using (true) with check (true);

-- RLS dice QUE filas; sin grants PostgREST corta antes con "permission denied".
grant select, insert, update on public.alumnos, public.productos, public.ventas to authenticated;
