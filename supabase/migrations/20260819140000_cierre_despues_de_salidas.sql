-- El turno no puede cerrar antes del ultimo movimiento de responsables.
--
-- Sale del caso: uno abre a las 6:30 y se va a las 8, otro llega a las 7 y se
-- queda hasta las 9. Lo correcto es que el de las 6:30 marque su salida y que
-- cierre el ultimo, a las 9. Pero si el de las 6:30 cierra igual y ademas pone
-- que el turno termino a las 7:30, queda un turno que cerro antes de que uno de
-- sus responsables se fuera. Eso no puede pasar.
--
-- Cerrar con alguien todavia adentro sigue estando permitido: lo normal es que
-- el turno termine con dos o tres personas a cargo y se vayan todas juntas.
-- Lo que se avisa en la pantalla es que el cierre los saca a todos.
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
  v_ultimo timestamptz;
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

  -- hasta siempre es mayor o igual que desde, asi que este maximo cubre tanto
  -- al ultimo que se fue como al ultimo que entro.
  select max(coalesce(hasta, desde)) into v_ultimo
    from public.turno_responsables
   where turno_id = v_turno.id;
  if v_ultimo is not null and v_cerrado < v_ultimo then
    raise exception 'hay responsables en el turno hasta las %, no puede cerrar antes',
      to_char(v_ultimo at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI');
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

  -- El que todavia figura adentro se va con el turno.
  update public.turno_responsables
     set hasta = v_cerrado
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
