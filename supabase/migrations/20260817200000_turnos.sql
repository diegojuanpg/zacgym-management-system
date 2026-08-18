-- Turnos: sin turno abierto no se carga nada en el mostrador.
--
-- Sirve para saber quien anoto que. La cuenta la lleva el turno, no la sesion:
-- en un turno puede haber mas de un responsable y no todos tienen login, asi
-- que los responsables son una lista propia y no usuarios de auth.

create table public.empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table public.turnos (
  id uuid primary key default gen_random_uuid(),
  abierto_en timestamptz not null default now(),
  abierto_por uuid not null references auth.users on delete restrict,
  cerrado_en timestamptz,
  cerrado_por uuid references auth.users on delete restrict,

  -- Lo declarado al abrir.
  caja_grande_inicial integer not null check (caja_grande_inicial >= 0),
  caja_chica_inicial integer not null check (caja_chica_inicial >= 0),

  -- Lo contado al cerrar, y lo que el sistema esperaba en ese momento.
  caja_grande_final integer,
  caja_chica_final integer,
  caja_grande_esperada integer,
  caja_chica_esperada integer,
  nota_cierre text
);

-- Un solo turno abierto a la vez: el mostrador es uno.
create unique index turnos_uno_abierto on public.turnos ((cerrado_en is null))
  where cerrado_en is null;

create table public.turno_responsables (
  turno_id uuid not null references public.turnos on delete cascade,
  empleado_id uuid not null references public.empleados on delete restrict,
  primary key (turno_id, empleado_id)
);

-- Conteo de stock al abrir y al cerrar. Solo entran los productos que se
-- contaron: los que no se tocaron no dejan fila.
create table public.turno_stock (
  turno_id uuid not null references public.turnos on delete cascade,
  producto_id uuid not null references public.productos on delete restrict,
  momento text not null check (momento in ('apertura', 'cierre')),
  contado integer not null check (contado >= 0),
  esperado integer not null,
  primary key (turno_id, producto_id, momento)
);

-- Cada movimiento queda pegado a su turno: de ahi sale el mostrador y de ahi
-- sale quien lo cargo.
alter table public.ventas add column turno_id uuid references public.turnos on delete restrict;
alter table public.pagos add column turno_id uuid references public.turnos on delete restrict;
alter table public.movimientos_caja add column turno_id uuid references public.turnos on delete restrict;

create index ventas_turno_idx on public.ventas (turno_id);
create index pagos_turno_idx on public.pagos (turno_id);
create index movimientos_turno_idx on public.movimientos_caja (turno_id);

-- ============================== lectura ==============================

/** El turno abierto con lo que el sistema espera que haya en cada cajon. */
create or replace view public.turno_actual as
  select t.id,
         t.abierto_en,
         t.caja_grande_inicial,
         t.caja_chica_inicial,
         (t.caja_grande_inicial
           + coalesce((select sum(pg.monto)
                         from public.pagos pg
                         join public.ventas v on v.id = pg.venta_id
                         join public.productos p on p.id = v.producto_id
                        where pg.turno_id = t.id
                          and pg.metodo = 'efectivo'
                          and coalesce(p.caja, 'grande') = 'grande'), 0)
           + coalesce((select sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end)
                         from public.movimientos_caja m
                        where m.turno_id = t.id
                          and m.metodo = 'efectivo'
                          and m.caja = 'grande'
                          and m.anulado_en is null), 0))::integer as caja_grande_esperada,
         (t.caja_chica_inicial
           + coalesce((select sum(pg.monto)
                         from public.pagos pg
                         join public.ventas v on v.id = pg.venta_id
                         join public.productos p on p.id = v.producto_id
                        where pg.turno_id = t.id
                          and pg.metodo = 'efectivo'
                          and coalesce(p.caja, 'grande') = 'chica'), 0)
           + coalesce((select sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end)
                         from public.movimientos_caja m
                        where m.turno_id = t.id
                          and m.metodo = 'efectivo'
                          and m.caja = 'chica'
                          and m.anulado_en is null), 0))::integer as caja_chica_esperada,
         (select coalesce(array_agg(e.nombre order by e.nombre), '{}')
            from public.turno_responsables tr
            join public.empleados e on e.id = tr.empleado_id
           where tr.turno_id = t.id) as responsables
    from public.turnos t
   where t.cerrado_en is null;

grant select on public.turno_actual to authenticated;

-- ============================== abrir y cerrar ==============================

/**
 * Abre el turno. Todo es obligatorio: al menos un responsable y los dos saldos.
 * El stock contado pisa al del catalogo, porque el conteo fisico manda; los
 * productos que no se contaron quedan como estaban.
 * p_stock: [{producto_id, contado}]
 */
create or replace function public.abrir_turno(
  p_responsables uuid[],
  p_caja_grande integer,
  p_caja_chica integer,
  p_stock jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turno uuid;
  v_item jsonb;
  v_esperado integer;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if p_responsables is null or array_length(p_responsables, 1) is null then
    raise exception 'elegi al menos un responsable';
  end if;
  if p_caja_grande is null or p_caja_chica is null then
    raise exception 'falta el saldo inicial de alguna caja';
  end if;
  if exists (select 1 from public.turnos where cerrado_en is null) then
    raise exception 'ya hay un turno abierto';
  end if;

  insert into public.turnos (abierto_por, caja_grande_inicial, caja_chica_inicial)
  values (auth.uid(), p_caja_grande, p_caja_chica)
  returning id into v_turno;

  insert into public.turno_responsables (turno_id, empleado_id)
  select v_turno, unnest(p_responsables);

  for v_item in select * from jsonb_array_elements(p_stock) loop
    select stock into v_esperado
      from public.productos
     where id = (v_item ->> 'producto_id')::uuid
     for update;

    if v_esperado is not null then
      insert into public.turno_stock (turno_id, producto_id, momento, contado, esperado)
      values (v_turno, (v_item ->> 'producto_id')::uuid, 'apertura',
              (v_item ->> 'contado')::integer, v_esperado);

      update public.productos
         set stock = (v_item ->> 'contado')::integer
       where id = (v_item ->> 'producto_id')::uuid;
    end if;
  end loop;

  return v_turno;
end;
$$;

/**
 * Cierra el turno. La diferencia se registra, no bloquea: quien cierra queda
 * anotado junto con lo que faltaba o sobraba.
 */
create or replace function public.cerrar_turno(
  p_caja_grande integer,
  p_caja_chica integer,
  p_stock jsonb default '[]'::jsonb,
  p_nota text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turno public.turno_actual%rowtype;
  v_item jsonb;
  v_esperado integer;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  select * into v_turno from public.turno_actual;
  if not found then
    raise exception 'no hay ningun turno abierto';
  end if;
  if p_caja_grande is null or p_caja_chica is null then
    raise exception 'falta el conteo de alguna caja';
  end if;

  for v_item in select * from jsonb_array_elements(p_stock) loop
    select stock into v_esperado
      from public.productos
     where id = (v_item ->> 'producto_id')::uuid
     for update;

    if v_esperado is not null then
      insert into public.turno_stock (turno_id, producto_id, momento, contado, esperado)
      values (v_turno.id, (v_item ->> 'producto_id')::uuid, 'cierre',
              (v_item ->> 'contado')::integer, v_esperado)
      on conflict (turno_id, producto_id, momento) do update
        set contado = excluded.contado, esperado = excluded.esperado;

      update public.productos
         set stock = (v_item ->> 'contado')::integer
       where id = (v_item ->> 'producto_id')::uuid;
    end if;
  end loop;

  update public.turnos
     set cerrado_en = now(),
         cerrado_por = auth.uid(),
         caja_grande_final = p_caja_grande,
         caja_chica_final = p_caja_chica,
         caja_grande_esperada = v_turno.caja_grande_esperada,
         caja_chica_esperada = v_turno.caja_chica_esperada,
         nota_cierre = nullif(btrim(coalesce(p_nota, '')), '')
   where id = v_turno.id;
end;
$$;

grant execute on function public.abrir_turno(uuid[], integer, integer, jsonb) to authenticated;
grant execute on function public.cerrar_turno(integer, integer, jsonb, text) to authenticated;

-- ============================== el sello ==============================

/**
 * Pega cada movimiento al turno abierto, y corta si no hay ninguno.
 *
 * Va como trigger y no dentro de registrar_lote porque las inserciones entran
 * por tres funciones distintas (registrar_ventas, registrar_movimiento,
 * registrar_cobro). En la tabla, ningun camino se lo saltea.
 */
create or replace function public.sellar_turno()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turno uuid;
begin
  select id into v_turno from public.turnos where cerrado_en is null;
  if v_turno is null then
    raise exception 'no hay un turno abierto: inicia turno para cargar movimientos';
  end if;
  new.turno_id := v_turno;
  return new;
end;
$$;

create trigger ventas_sella_turno before insert on public.ventas
  for each row execute function public.sellar_turno();
create trigger pagos_sella_turno before insert on public.pagos
  for each row execute function public.sellar_turno();
create trigger movimientos_sella_turno before insert on public.movimientos_caja
  for each row execute function public.sellar_turno();

-- ============================== permisos ==============================

alter table public.empleados enable row level security;
alter table public.turnos enable row level security;
alter table public.turno_responsables enable row level security;
alter table public.turno_stock enable row level security;

create policy staff_empleados on public.empleados for all to authenticated
  using (true) with check (true);
create policy staff_lee on public.turnos for select to authenticated using (true);
create policy staff_abre on public.turnos for insert to authenticated
  with check (abierto_por = auth.uid());
create policy staff_cierra on public.turnos for update to authenticated
  using (true) with check (true);
create policy staff_responsables on public.turno_responsables for all to authenticated
  using (true) with check (true);
create policy staff_stock on public.turno_stock for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.empleados to authenticated;
grant select, insert, update on public.turnos to authenticated;
grant select, insert, delete on public.turno_responsables to authenticated;
grant select, insert, update on public.turno_stock to authenticated;

-- ============================== turno en las vistas ==============================
-- El mostrador ya no filtra por dia sino por turno abierto, asi que las vistas
-- que lee tienen que decir de que turno es cada fila.

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
         v.turno_id
    from public.ventas v
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id
    left join public.pagos pg on pg.venta_id = v.id
   group by v.id, a.nombre_completo, p.nombre, p.categoria;

create or replace view public.pagos_detalle as
  select pg.id,
         pg.venta_id,
         v.alumno_id,
         a.nombre_completo as alumno,
         p.nombre as producto,
         pg.monto,
         pg.metodo,
         pg.creado_en,
         v.creado_en as venta_creada_en,
         v.anulada_en,
         coalesce(p.caja, 'grande')::public.caja as caja,
         pg.turno_id
    from public.pagos pg
    join public.ventas v on v.id = pg.venta_id
    join public.alumnos a on a.id = v.alumno_id
    join public.productos p on p.id = v.producto_id;

create or replace view public.movimientos_caja_detalle as
  select id, tipo, caja, metodo, monto, motivo, creado_por, creado_en,
         anulado_en, anulado_por,
         case when tipo = 'ingreso' then monto else -monto end as delta,
         turno_id
    from public.movimientos_caja m;

grant select on public.ventas_saldo, public.pagos_detalle, public.movimientos_caja_detalle
  to authenticated;
