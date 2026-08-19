-- La asistencia se separa del turno.
--
-- Eran dos cosas distintas metidas en la misma tabla: la jornada de una persona
-- puede cruzar varios turnos, y un turno puede tener varias jornadas. Por eso
-- hubo que parchear dos veces esta semana (horarios por responsable, despues el
-- cierre que pisaba una salida).
--
-- Ahora el empleado ficha cuando llega: la entrada es el momento en que apreta
-- el boton y la salida la elige el, porque los horarios varian. El turno deja de
-- preguntar quien esta a cargo: se cruza el rango del turno con las asistencias
-- y sale solo.
--
-- La salida es lo que declaro al llegar, no un hecho: por eso se puede pisar con
-- "Me voy", que la deja en la hora real.

create extension if not exists btree_gist;

create table public.asistencias (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados on delete restrict,
  entro timestamptz not null default now(),
  salio timestamptz,
  creado_por uuid references auth.users on delete set null,
  creado_en timestamptz not null default now(),

  constraint asistencias_horario check (salio is null or salio > entro),
  -- Nadie trabaja dos jornadas a la vez. Sin esto, fichar dos veces seguidas
  -- deja a la misma persona contada dos veces en el mismo turno.
  constraint asistencias_sin_solaparse
    exclude using gist (empleado_id with =, tstzrange(entro, salio) with &&)
);

create index asistencias_entro_idx on public.asistencias (entro desc);

-- Lo que ya estaba: cada responsable de un turno era una jornada.
insert into public.asistencias (empleado_id, entro, salio)
select tr.empleado_id, tr.desde, tr.hasta
  from public.turno_responsables tr
 order by tr.desde;

alter table public.asistencias enable row level security;

create policy staff_lee on public.asistencias for select to authenticated using (true);
create policy staff_ficha on public.asistencias for insert to authenticated with check (true);
create policy staff_edita on public.asistencias for update to authenticated using (true) with check (true);
create policy staff_borra on public.asistencias for delete to authenticated using (true);

grant select, insert, update, delete on public.asistencias to authenticated;

-- ============================== fichar ==============================

/**
 * Ficha la llegada. La entrada es ahora, no se elige: es la hora a la que se
 * apreto el boton. La salida es hasta cuando piensa quedarse.
 */
create or replace function public.fichar_asistencia(
  p_empleado uuid,
  p_salida timestamptz
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
  if p_empleado is null then
    raise exception 'elegi quien esta fichando';
  end if;
  if p_salida is null then
    raise exception 'poné hasta que hora trabaja';
  end if;
  if p_salida <= now() then
    raise exception 'la salida tiene que ser posterior a ahora';
  end if;
  if exists (select 1 from public.asistencias
              where empleado_id = p_empleado
                and tstzrange(entro, salio) @> now()) then
    raise exception 'ya fichó, todavía está trabajando';
  end if;

  insert into public.asistencias (empleado_id, salio, creado_por)
  values (p_empleado, p_salida, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

/**
 * "Me voy": pisa la salida declarada con la hora real. Tambien sirve para
 * corregirla, que es lo mismo con otra hora.
 */
create or replace function public.terminar_asistencia(
  p_id uuid,
  p_salio timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entro timestamptz;
  v_salio timestamptz := coalesce(p_salio, now());
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;

  select entro into v_entro from public.asistencias where id = p_id;
  if not found then
    raise exception 'esa asistencia no existe';
  end if;
  if v_salio <= v_entro then
    raise exception 'entró %, no puede irse antes',
      to_char(v_entro at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI');
  end if;
  -- Un minuto de margen: entre elegir la hora y apretar el boton el reloj sigue.
  if v_salio > now() + interval '1 minute' then
    raise exception 'nadie puede irse en el futuro';
  end if;

  update public.asistencias set salio = v_salio where id = p_id;
end;
$$;

grant execute on function public.fichar_asistencia(uuid, timestamptz) to authenticated;
grant execute on function public.terminar_asistencia(uuid, timestamptz) to authenticated;

-- ============================== el cruce ==============================

/** Quien estuvo trabajando en un rango. Un turno abierto se mide hasta ahora. */
create or replace function public.empleados_en(
  p_desde timestamptz,
  p_hasta timestamptz default null
)
returns table (asistencia_id uuid, empleado_id uuid, nombre text,
               entro timestamptz, salio timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.empleado_id, e.nombre, a.entro, a.salio
    from public.asistencias a
    join public.empleados e on e.id = a.empleado_id
   -- Rangos semiabiertos: el que se fue 10:04 no cuenta en el turno que arranco
   -- 10:04.
   where tstzrange(a.entro, a.salio) && tstzrange(p_desde, coalesce(p_hasta, now()))
   order by a.entro, e.nombre;
$$;

/**
 * Lo mismo listo para las vistas: los nombres sueltos y el detalle con horarios.
 * Las claves del detalle son desde/hasta, igual que antes, para que las
 * pantallas no tengan que distinguir de donde sale.
 */
create or replace function public.responsables_entre(
  p_desde timestamptz,
  p_hasta timestamptz
)
returns table (nombres text[], detalle jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  -- Sin repetir nombres: una misma persona puede tener dos jornadas adentro del
  -- mismo turno si se fue y volvio.
  select coalesce((select array_agg(nombre order by entro, nombre)
                     from (select nombre, min(entro) as entro
                             from public.empleados_en(p_desde, p_hasta)
                            group by nombre) uno), '{}'),
         coalesce((select jsonb_agg(jsonb_build_object(
                            'empleado_id', empleado_id,
                            'asistencia_id', asistencia_id,
                            'nombre', nombre,
                            'desde', entro,
                            'hasta', salio
                          ) order by entro, nombre)
                     from public.empleados_en(p_desde, p_hasta)), '[]'::jsonb);
$$;

grant execute on function public.empleados_en(timestamptz, timestamptz) to authenticated;
grant execute on function public.responsables_entre(timestamptz, timestamptz) to authenticated;

-- ============================== abrir y cerrar ==============================
-- Abrir turno deja de preguntar quien esta a cargo, y cerrar deja de marcar
-- salidas: las dos cosas ahora salen del fichaje.

drop function if exists public.sumar_responsable(uuid, timestamptz);
drop function if exists public.sacar_responsable(uuid, timestamptz);
drop function if exists public.abrir_turno(uuid[], integer, integer, jsonb, timestamptz);

create or replace function public.abrir_turno(
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

  -- El turno ya no toca las asistencias: cerrar el mostrador no es que la gente
  -- se haya ido a su casa.
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

grant execute on function public.abrir_turno(integer, integer, jsonb, timestamptz) to authenticated;
grant execute on function public.cerrar_turno(integer, integer, jsonb, text, timestamptz) to authenticated;

-- ============================== lectura ==============================
-- Las vistas dejan de leer turno_responsables y cruzan contra las asistencias.
-- Un turno cerrado no guarda nombres: se recalculan al mirarlo, asi corregir un
-- fichaje corrige tambien los turnos donde esa persona figuraba mal.

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
    cross join lateral public.responsables_entre(t.abierto_en, null) r
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
    cross join lateral public.responsables_entre(t.abierto_en, t.cerrado_en) r
   where t.cerrado_en is not null;

alter view public.turnos_cerrados set (security_invoker = on);
grant select on public.turnos_cerrados to authenticated;

drop view if exists public.diferencias_stock;

create view public.diferencias_stock as
  select ts.turno_id,
         ts.momento,
         ts.producto_id,
         p.nombre as producto,
         p.precio,
         ts.contado,
         ts.esperado,
         (ts.contado - ts.esperado) as diferencia,
         -- Lo que cuesta el faltante: una proteina pesa lo que 69 aguas.
         ((ts.contado - ts.esperado) * p.precio) as valor,
         t.abierto_en,
         t.cerrado_en,
         r.nombres as responsables
    from public.turno_stock ts
    join public.productos p on p.id = ts.producto_id
    join public.turnos t on t.id = ts.turno_id
    cross join lateral public.responsables_entre(t.abierto_en, t.cerrado_en) r
   where ts.contado <> ts.esperado;

alter view public.diferencias_stock set (security_invoker = on);
grant select on public.diferencias_stock to authenticated;

/** La jornada de cada uno, para la pantalla de asistencia. */
create or replace view public.asistencias_detalle as
  select a.id,
         a.empleado_id,
         e.nombre,
         a.entro,
         a.salio,
         -- Sigue adentro mientras la hora declarada no haya pasado.
         (a.salio is null or a.salio > now()) as trabajando,
         a.creado_en
    from public.asistencias a
    join public.empleados e on e.id = a.empleado_id;

alter view public.asistencias_detalle set (security_invoker = on);
grant select on public.asistencias_detalle to authenticated;

-- Ya no la lee nadie: quien estuvo en un turno sale del fichaje.
drop table public.turno_responsables;

-- La vieja: leia turno_responsables, que ya no existe. La reemplaza
-- responsables_entre, que cruza contra las asistencias.
drop function if exists public.responsables_de(uuid);
