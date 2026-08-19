-- Cada responsable con su horario propio adentro del turno.
--
-- El caso real: Clemente abre a las 6:30, yo llego a las 7 y los dos nos
-- quedamos hasta las 14. Hasta ahora el turno tenia una lista plana de
-- responsables, asi que sumarme borraba la diferencia: figuraba desde las 6:30,
-- media hora que no estuve. Y al reves, el que se va a las 12 quedaba como si
-- hubiera contado la caja al cerrar.
--
-- El turno sigue siendo uno solo. Cerrar a las 7 para abrir otro con los dos
-- obligaria a contar la caja cada vez que entra alguien, que no es lo que pasa:
-- la caja es la misma, lo que cambia es quien la esta atendiendo.

alter table public.turno_responsables
  add column id uuid not null default gen_random_uuid(),
  add column desde timestamptz,
  add column hasta timestamptz;

-- Lo que ya estaba cargado: entraron cuando abrio el turno y salieron cuando
-- cerro, que es lo unico que el modelo viejo podia significar.
update public.turno_responsables tr
   set desde = t.abierto_en,
       hasta = t.cerrado_en
  from public.turnos t
 where t.id = tr.turno_id;

alter table public.turno_responsables
  alter column desde set not null,
  alter column desde set default now(),
  add constraint turno_responsables_horario check (hasta is null or hasta >= desde);

-- La clave pasa a ser propia: una persona puede tener mas de un tramo en el
-- mismo turno si se va y vuelve.
alter table public.turno_responsables drop constraint turno_responsables_pkey;
alter table public.turno_responsables add primary key (id);

-- Pero un solo tramo abierto por vez: sumar a alguien que ya esta adentro es un
-- error, no una fila nueva.
create unique index turno_responsables_uno_abierto
  on public.turno_responsables (turno_id, empleado_id)
  where hasta is null;

create index turno_responsables_turno_idx on public.turno_responsables (turno_id);

-- ============================== entrar y salir ==============================

/**
 * Suma a alguien al turno abierto desde la hora que diga.
 *
 * La hora se elige por lo mismo que se elige la de apertura: se carga cuando
 * hay un rato libre, no cuando la persona cruza la puerta.
 */
create or replace function public.sumar_responsable(
  p_empleado uuid,
  p_desde timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turno public.turnos%rowtype;
  v_desde timestamptz := coalesce(p_desde, now());
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  select * into v_turno from public.turnos where cerrado_en is null;
  if not found then
    raise exception 'no hay ningun turno abierto';
  end if;
  if p_empleado is null then
    raise exception 'elegi a quien sumar';
  end if;

  -- Mismo margen de un minuto que al abrir: entre elegir la hora y apretar el
  -- boton el reloj sigue corriendo.
  if v_desde > now() + interval '1 minute' then
    raise exception 'nadie puede entrar en el futuro';
  end if;
  if v_desde < v_turno.abierto_en then
    raise exception 'el turno arranco %, no se puede entrar antes',
      to_char(v_turno.abierto_en at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI');
  end if;
  if exists (select 1
               from public.turno_responsables
              where turno_id = v_turno.id
                and empleado_id = p_empleado
                and hasta is null) then
    raise exception 'ya esta en el turno';
  end if;

  insert into public.turno_responsables (turno_id, empleado_id, desde)
  values (v_turno.id, p_empleado, v_desde);
end;
$$;

/** Marca que alguien se fue antes de que termine el turno. */
create or replace function public.sacar_responsable(
  p_empleado uuid,
  p_hasta timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turno public.turnos%rowtype;
  v_hasta timestamptz := coalesce(p_hasta, now());
  v_desde timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  select * into v_turno from public.turnos where cerrado_en is null;
  if not found then
    raise exception 'no hay ningun turno abierto';
  end if;

  select desde into v_desde
    from public.turno_responsables
   where turno_id = v_turno.id and empleado_id = p_empleado and hasta is null;
  if not found then
    raise exception 'esa persona no esta en el turno';
  end if;

  if v_hasta > now() + interval '1 minute' then
    raise exception 'nadie puede irse en el futuro';
  end if;
  if v_hasta < v_desde then
    raise exception 'entro %, no puede irse antes',
      to_char(v_desde at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI');
  end if;
  -- Sin nadie a cargo el turno queda huerfano: el ultimo se va cerrandolo.
  if (select count(*) from public.turno_responsables
       where turno_id = v_turno.id and hasta is null) = 1 then
    raise exception 'es el unico a cargo: cerra el turno en vez de sacarlo';
  end if;

  update public.turno_responsables
     set hasta = v_hasta
   where turno_id = v_turno.id and empleado_id = p_empleado and hasta is null;
end;
$$;

grant execute on function public.sumar_responsable(uuid, timestamptz) to authenticated;
grant execute on function public.sacar_responsable(uuid, timestamptz) to authenticated;

-- La tabla tenia para leer, crear y borrar, pero no para editar: marcar la
-- salida es un update. La policy staff_responsables es "for all" y ya lo cubre,
-- pero sin el grant Postgres corta antes de mirar el RLS.
grant update on public.turno_responsables to authenticated;

-- ============================== abrir y cerrar ==============================
-- abrir_turno: los que abren entran a la hora del turno, no a la de ahora.
-- cerrar_turno: al que sigue adentro lo saca el cierre.

create or replace function public.abrir_turno(
  p_responsables uuid[],
  p_caja_grande integer,
  p_caja_chica integer,
  p_stock jsonb default '[]'::jsonb,
  p_abierto_en timestamptz default null
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
  v_abierto timestamptz := coalesce(p_abierto_en, now());
  v_ultimo timestamptz;
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

  if v_abierto > now() + interval '1 minute' then
    raise exception 'el turno no puede arrancar en el futuro';
  end if;

  select max(cerrado_en) into v_ultimo from public.turnos;
  if v_ultimo is not null and v_abierto < v_ultimo then
    raise exception 'el turno anterior cerro %, no se puede arrancar antes',
      to_char(v_ultimo at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI');
  end if;

  insert into public.turnos (abierto_en, abierto_por, caja_grande_inicial, caja_chica_inicial)
  values (v_abierto, auth.uid(), p_caja_grande, p_caja_chica)
  returning id into v_turno;

  insert into public.turno_responsables (turno_id, empleado_id, desde)
  select v_turno, unnest(p_responsables), v_abierto;

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

create or replace function public.cerrar_turno(
  p_caja_grande integer,
  p_caja_chica integer,
  p_stock jsonb default '[]'::jsonb,
  p_nota text default null,
  p_cerrado_en timestamptz default null
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
  v_cerrado timestamptz := coalesce(p_cerrado_en, now());
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

  if v_cerrado > now() + interval '1 minute' then
    raise exception 'el turno no puede cerrar en el futuro';
  end if;
  if v_cerrado < v_turno.abierto_en then
    raise exception 'el turno arranco %, no puede cerrar antes',
      to_char(v_turno.abierto_en at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI');
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

  -- El que todavia figura adentro se va con el turno. greatest por el caso de
  -- alguien sumado con una hora posterior al cierre elegido.
  update public.turno_responsables
     set hasta = greatest(v_cerrado, desde)
   where turno_id = v_turno.id and hasta is null;

  update public.turnos
     set cerrado_en = v_cerrado,
         cerrado_por = auth.uid(),
         caja_grande_final = p_caja_grande,
         caja_chica_final = p_caja_chica,
         caja_grande_esperada = v_turno.caja_grande_esperada,
         caja_chica_esperada = v_turno.caja_chica_esperada,
         nota_cierre = nullif(btrim(coalesce(p_nota, '')), '')
   where id = v_turno.id;
end;
$$;

-- ============================== lectura ==============================
-- responsables sigue siendo la lista de nombres, que es lo que se muestra en
-- casi todos lados. Al lado va el detalle con los horarios, para las pantallas
-- que necesitan saber quien estaba a que hora.

/**
 * Quien estuvo a cargo de un turno: los nombres sueltos y el detalle con
 * horarios. Una sola pasada por turno, en vez del mismo subselect repetido en
 * cada vista.
 */
create or replace function public.responsables_de(p_turno uuid)
returns table (nombres text[], detalle jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  -- Los nombres van sin repetir aunque alguien tenga dos tramos, y ordenados
  -- por la hora a la que entro: primero el que abrio.
  select coalesce((select array_agg(nombre order by entro, nombre)
                     from (select e.nombre, min(tr.desde) as entro
                             from public.turno_responsables tr
                             join public.empleados e on e.id = tr.empleado_id
                            where tr.turno_id = p_turno
                            group by e.nombre) uno), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object(
                            'empleado_id', e.id,
                            'nombre', e.nombre,
                            'desde', tr.desde,
                            'hasta', tr.hasta
                          ) order by tr.desde, e.nombre)
                     from public.turno_responsables tr
                     join public.empleados e on e.id = tr.empleado_id
                    where tr.turno_id = p_turno), '[]'::jsonb);
$$;

grant execute on function public.responsables_de(uuid) to authenticated;

drop view if exists public.turno_actual;

create view public.turno_actual as
  select t.id,
         t.abierto_en,
         t.caja_grande_inicial,
         t.caja_chica_inicial,
         v.grande as ventas_grande,
         v.chica as ventas_chica,
         m.grande as movimientos_grande,
         m.chica as movimientos_chica,
         (t.caja_grande_inicial + v.grande + m.grande)::integer as caja_grande_esperada,
         (t.caja_chica_inicial + v.chica + m.chica)::integer as caja_chica_esperada,
         r.nombres as responsables,
         r.detalle as responsables_detalle
    from public.turnos t
    -- Lo cobrado en efectivo, a la caja que le toca a cada producto. Entran
    -- tambien los cobros de deuda: el pago es de este turno aunque la venta
    -- sea vieja.
    cross join lateral (
      select coalesce(sum(pg.monto) filter (where coalesce(p.caja, 'grande') = 'grande'), 0)::integer as grande,
             coalesce(sum(pg.monto) filter (where coalesce(p.caja, 'grande') = 'chica'), 0)::integer as chica
        from public.pagos pg
        join public.ventas ve on ve.id = pg.venta_id
        join public.productos p on p.id = ve.producto_id
       where pg.turno_id = t.id and pg.metodo = 'efectivo'
    ) v
    cross join lateral (
      select coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end)
                        filter (where mc.caja = 'grande'), 0)::integer as grande,
             coalesce(sum(case when mc.tipo = 'ingreso' then mc.monto else -mc.monto end)
                        filter (where mc.caja = 'chica'), 0)::integer as chica
        from public.movimientos_caja mc
       where mc.turno_id = t.id and mc.metodo = 'efectivo' and mc.anulado_en is null
    ) m
    cross join lateral public.responsables_de(t.id) r
   where t.cerrado_en is null;

alter view public.turno_actual set (security_invoker = on);
grant select on public.turno_actual to authenticated;

drop view if exists public.turnos_cerrados;

create view public.turnos_cerrados as
  select t.id,
         t.abierto_en,
         t.cerrado_en,
         t.caja_grande_inicial,
         t.caja_chica_inicial,
         t.caja_grande_final,
         t.caja_chica_final,
         t.caja_grande_esperada,
         t.caja_chica_esperada,
         (t.caja_grande_final - t.caja_grande_esperada) as dif_grande,
         (t.caja_chica_final - t.caja_chica_esperada) as dif_chica,
         t.nota_cierre,
         r.nombres as responsables,
         r.detalle as responsables_detalle,
         (select count(*)::integer
            from public.turno_stock ts
           where ts.turno_id = t.id and ts.momento = 'cierre') as contados
    from public.turnos t
    cross join lateral public.responsables_de(t.id) r
   where t.cerrado_en is not null;

alter view public.turnos_cerrados set (security_invoker = on);
grant select on public.turnos_cerrados to authenticated;
