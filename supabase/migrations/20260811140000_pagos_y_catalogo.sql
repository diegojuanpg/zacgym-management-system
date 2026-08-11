-- Nucleo de pagos: catalogo, alumnos, ventas y pagos.
--
-- Modelo: cada linea vendida es una fila en `ventas`. Cobrar es insertar en `pagos`.
-- Una venta pagada en el acto = venta + pago por el total. Una venta fiada = venta sin
-- pago. La deuda no es un estado que alguien marca: es `total - sum(pagos)`, y por eso
-- no puede quedar desincronizada como en el sheet.
--
-- Plata en enteros (pesos, sin centavos): asi es como se maneja hoy y evita float.

create type public.producto_tipo as enum ('mensualidad', 'consumible', 'suplemento');
create type public.metodo_pago as enum ('efectivo', 'transferencia');

create or replace function public.es_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- ============================== catalogo ==============================

create table public.familias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  creado_en timestamptz not null default now()
);

create table public.alumnos (
  id uuid primary key default gen_random_uuid(),
  apellido text not null,
  nombre text not null,
  familia_id uuid references public.familias on delete set null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  -- Nombre canonico: como se muestra y como se ordena en todo el sistema.
  nombre_completo text generated always as (apellido || ', ' || nombre) stored,
  unique (apellido, nombre)
);

create index alumnos_nombre_completo_idx on public.alumnos (nombre_completo);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  tipo public.producto_tipo not null,
  precio integer not null check (precio >= 0),
  -- Cuantos meses de membresia cubre. Solo para tipo mensualidad.
  meses_equivale smallint check (meses_equivale is null or meses_equivale > 0),
  stock integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint meses_solo_en_mensualidad check (tipo = 'mensualidad' or meses_equivale is null)
);

-- ============================== ventas y pagos ==============================

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references public.alumnos on delete restrict,
  producto_id uuid not null references public.productos on delete restrict,
  cantidad smallint not null default 1 check (cantidad > 0),
  -- Precio congelado: cambiar el catalogo despues no reescribe la historia.
  precio_unitario integer not null check (precio_unitario >= 0),
  total integer generated always as (cantidad * precio_unitario) stored,
  nota text,
  creado_por uuid not null references auth.users on delete restrict,
  creado_en timestamptz not null default now(),
  anulada_en timestamptz,
  anulada_por uuid references auth.users on delete restrict
);

create index ventas_alumno_idx on public.ventas (alumno_id, creado_en desc);
create index ventas_fecha_idx on public.ventas (creado_en desc);

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

-- ============================== saldos ==============================

create view public.ventas_saldo as
  select v.id,
         v.alumno_id,
         a.nombre_completo as alumno,
         v.producto_id,
         p.nombre as producto,
         p.tipo,
         v.cantidad,
         v.precio_unitario,
         v.total,
         v.nota,
         v.creado_en,
         v.creado_por,
         v.anulada_en,
         coalesce(sum(pg.monto), 0)::integer as pagado,
         (v.total - coalesce(sum(pg.monto), 0))::integer as saldo
    from public.ventas v
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id
    left join public.pagos pg on pg.venta_id = v.id
   where v.anulada_en is null
   group by v.id, a.nombre_completo, p.nombre, p.tipo;

create view public.alumnos_saldo as
  select a.id,
         a.nombre_completo,
         a.activo,
         coalesce(sum(vs.saldo), 0)::integer as deuda,
         count(vs.id) filter (where vs.saldo > 0) as ventas_impagas
    from public.alumnos a
    left join public.ventas_saldo vs on vs.alumno_id = a.id and vs.saldo > 0
   group by a.id;

-- ============================== operaciones ==============================

-- Venta + cobro + descuento de stock en una sola transaccion. En el sheet esto son
-- tres pasos sueltos que pueden quedar a medio hacer.
create or replace function public.registrar_venta(
  p_alumno_id uuid,
  p_producto_id uuid,
  p_cantidad smallint default 1,
  p_metodo public.metodo_pago default null,   -- null = queda fiado
  p_nota text default null
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

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'el producto no existe';
  end if;
  if not v_producto.activo then
    raise exception 'el producto % esta desactivado', v_producto.nombre;
  end if;

  insert into public.ventas (alumno_id, producto_id, cantidad, precio_unitario, nota, creado_por)
  values (p_alumno_id, p_producto_id, p_cantidad, v_producto.precio, p_nota, auth.uid())
  returning id into v_venta_id;

  if p_metodo is not null then
    insert into public.pagos (venta_id, monto, metodo, creado_por)
    values (v_venta_id, v_producto.precio * p_cantidad, p_metodo, auth.uid());
  end if;

  -- Las mensualidades no tienen stock fisico.
  if v_producto.tipo <> 'mensualidad' then
    update public.productos
       set stock = stock - p_cantidad
     where id = p_producto_id;
  end if;

  return v_venta_id;
end;
$$;

-- Cobro (total o parcial) contra una venta fiada.
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

  select v.total into v_total
    from public.ventas v
   where v.id = p_venta_id and v.anulada_en is null
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

-- Anular = marcar, nunca borrar. Devuelve el stock y arrastra los pagos.
create or replace function public.anular_venta(p_venta_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_tipo public.producto_tipo;
begin
  if not public.es_admin() then
    raise exception 'solo un admin puede anular ventas';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id and anulada_en is null for update;
  if not found then
    raise exception 'la venta no existe o ya estaba anulada';
  end if;

  update public.ventas
     set anulada_en = now(), anulada_por = auth.uid()
   where id = p_venta_id;

  delete from public.pagos where venta_id = p_venta_id;

  select tipo into v_tipo from public.productos where id = v_venta.producto_id;
  if v_tipo <> 'mensualidad' then
    update public.productos set stock = stock + v_venta.cantidad where id = v_venta.producto_id;
  end if;
end;
$$;

-- ============================== RLS ==============================

alter table public.familias enable row level security;
alter table public.alumnos  enable row level security;
alter table public.productos enable row level security;
alter table public.ventas   enable row level security;
alter table public.pagos    enable row level security;

-- Todo el staff lee todo.
create policy staff_lee on public.familias  for select to authenticated using (true);
create policy staff_lee on public.alumnos   for select to authenticated using (true);
create policy staff_lee on public.productos for select to authenticated using (true);
create policy staff_lee on public.ventas    for select to authenticated using (true);
create policy staff_lee on public.pagos     for select to authenticated using (true);

-- El catalogo lo toca solo un admin.
create policy admin_escribe on public.familias  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy admin_escribe on public.productos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Alumnos: cualquiera del staff da de alta (es el boton del mostrador); borrar es de admin.
create policy staff_crea_alumnos on public.alumnos for insert to authenticated with check (true);
create policy admin_edita_alumnos on public.alumnos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
create policy admin_borra_alumnos on public.alumnos for delete to authenticated
  using (public.es_admin());

-- Ventas y pagos: los carga cualquiera, siempre a nombre propio. Nadie los edita a mano:
-- para revertir esta anular_venta(), que deja rastro.
create policy staff_carga_ventas on public.ventas for insert to authenticated
  with check (creado_por = auth.uid());
create policy staff_carga_pagos on public.pagos for insert to authenticated
  with check (creado_por = auth.uid());
create policy admin_anula on public.ventas for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- RLS decide QUE filas; los grants deciden si la tabla se puede tocar. Faltando estos,
-- PostgREST corta antes con "permission denied" aunque las policies sean correctas.
grant select, insert, update, delete on
  public.familias, public.alumnos, public.productos, public.ventas, public.pagos
  to authenticated;

grant select on public.ventas_saldo, public.alumnos_saldo to authenticated;
