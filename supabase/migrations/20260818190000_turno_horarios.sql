-- La hora del turno se elige, no la pone el reloj.
--
-- El caso real: alguien entra a las 7 pero recien abre el turno a las 9, porque
-- hasta esa hora no vendio nada. Si la apertura queda a las 9, las dos horas de
-- antes no son de nadie. Lo mismo al cerrar.
--
-- Los movimientos no se mueven: el trigger los pega al turno que estaba abierto
-- cuando se cargaron, y eso no cambia porque se corrija el horario.

drop function if exists public.abrir_turno(uuid[], integer, integer, jsonb);
drop function if exists public.cerrar_turno(integer, integer, jsonb, text);

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

  -- Un margen de un minuto: entre que se elige la hora y se aprieta el boton
  -- el reloj sigue corriendo.
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

grant execute on function public.abrir_turno(uuid[], integer, integer, jsonb, timestamptz) to authenticated;
grant execute on function public.cerrar_turno(integer, integer, jsonb, text, timestamptz) to authenticated;
