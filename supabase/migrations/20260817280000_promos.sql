-- Promos: un grupo de alumnos que paga un precio distinto.
--
-- La promo no es un producto nuevo, es a QUIENES les corresponde uno que ya
-- esta en el catalogo. "Promo Fliar x3" cuesta $45.000 contra los $50.000 de
-- la cuota suelta: el precio ya vive en productos, aca solo se guarda quienes
-- tienen derecho a el.
--
-- El grupo no vence ni cobra por su cuenta: cada integrante conserva su propia
-- fecha de vencimiento y se le cobra por separado, con el precio de la promo.

create table public.promos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- El producto que le corresponde al grupo. on delete restrict: borrar del
  -- catalogo un producto que una promo esta usando dejaria al grupo sin precio.
  producto_id uuid not null references public.productos on delete restrict,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.promo_integrantes (
  promo_id uuid not null references public.promos on delete cascade,
  alumno_id uuid not null references public.alumnos on delete cascade,
  primary key (promo_id, alumno_id),
  -- Un alumno en una sola promo: si estuviera en dos no habria forma de saber
  -- cual precio le toca al cobrarle.
  unique (alumno_id)
);

/** Las promos con su producto y sus integrantes, listas para listar. */
create or replace view public.promos_detalle as
  select pr.id,
         pr.nombre,
         pr.activa,
         pr.creado_en,
         pr.producto_id,
         p.nombre as producto,
         p.precio,
         (select count(*) from public.promo_integrantes pi where pi.promo_id = pr.id)::integer
           as cuantos,
         (select coalesce(array_agg(a.nombre_completo order by a.nombre_completo), '{}')
            from public.promo_integrantes pi
            join public.alumnos a on a.id = pi.alumno_id
           where pi.promo_id = pr.id) as integrantes
    from public.promos pr
    join public.productos p on p.id = pr.producto_id;

/** De alumno a su promo: lo que mira el mostrador al elegir a quien cobrarle. */
create or replace view public.alumno_promo as
  select pi.alumno_id,
         pr.id as promo_id,
         pr.nombre as promo,
         pr.producto_id,
         p.nombre as producto,
         p.precio
    from public.promo_integrantes pi
    join public.promos pr on pr.id = pi.promo_id
    join public.productos p on p.id = pr.producto_id
   where pr.activa;

grant select on public.promos_detalle, public.alumno_promo to authenticated;

-- ============================== permisos ==============================

alter table public.promos enable row level security;
alter table public.promo_integrantes enable row level security;

-- Las promos las arma el mostrador, igual que el catalogo.
create policy staff_promos on public.promos for all to authenticated
  using (true) with check (true);
create policy staff_integrantes on public.promo_integrantes for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.promos to authenticated;
grant select, insert, update, delete on public.promo_integrantes to authenticated;
