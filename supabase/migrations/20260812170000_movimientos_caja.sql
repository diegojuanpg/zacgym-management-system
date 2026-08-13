-- Plata que entra o sale sin ser una venta: sacar de la caja para la comida,
-- reponer la caja chica, pagarle a un proveedor. En la hoja actual esto vive
-- como texto suelto en ANOTACIONES y no se puede sumar.
--
-- Pasar plata de una caja a otra son dos movimientos (egreso de una, ingreso en
-- la otra) atados por el mismo motivo. No hace falta un tipo aparte.

create type public.caja as enum ('grande', 'chica');
create type public.movimiento_tipo as enum ('ingreso', 'egreso');

create table public.movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  tipo public.movimiento_tipo not null,
  caja public.caja not null default 'grande',
  metodo public.metodo_pago not null default 'efectivo',
  monto integer not null check (monto > 0),
  motivo text not null check (length(trim(motivo)) > 0),
  creado_por uuid not null references auth.users on delete restrict,
  creado_en timestamptz not null default now(),
  anulado_en timestamptz,
  anulado_por uuid references auth.users on delete restrict
);

create index movimientos_fecha_idx on public.movimientos_caja (creado_en desc);

-- Con signo: lo que el movimiento le suma o resta a la caja.
create view public.movimientos_caja_detalle as
  select m.*,
         case when m.tipo = 'ingreso' then m.monto else -m.monto end as delta
    from public.movimientos_caja m;

create or replace function public.registrar_movimiento(
  p_tipo public.movimiento_tipo,
  p_monto integer,
  p_motivo text,
  p_caja public.caja default 'grande',
  p_metodo public.metodo_pago default 'efectivo'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if p_monto <= 0 then
    raise exception 'el monto tiene que ser mayor a cero';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'hace falta un motivo';
  end if;

  insert into public.movimientos_caja (tipo, caja, metodo, monto, motivo, creado_por)
  values (p_tipo, p_caja, p_metodo, p_monto, trim(p_motivo), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- Anular deja rastro, igual que en las ventas.
create or replace function public.anular_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.movimientos_caja
     set anulado_en = now(), anulado_por = auth.uid()
   where id = p_movimiento_id and anulado_en is null;

  if not found then
    raise exception 'el movimiento no existe o ya estaba anulado';
  end if;
end;
$$;

alter table public.movimientos_caja enable row level security;

create policy staff_lee on public.movimientos_caja for select to authenticated using (true);
create policy staff_carga on public.movimientos_caja for insert to authenticated
  with check (creado_por = auth.uid());
create policy staff_anula on public.movimientos_caja for update to authenticated
  using (true) with check (true);

grant select, insert, update on public.movimientos_caja to authenticated;
grant select on public.movimientos_caja_detalle to authenticated;

-- Los dias con actividad ahora incluyen los de solo movimientos.
create or replace view public.dias_con_ventas as
  select dia from (
    select distinct (creado_en at time zone 'America/Argentina/Buenos_Aires')::date as dia
      from public.ventas
    union
    select distinct (creado_en at time zone 'America/Argentina/Buenos_Aires')::date
      from public.movimientos_caja
  ) d;
