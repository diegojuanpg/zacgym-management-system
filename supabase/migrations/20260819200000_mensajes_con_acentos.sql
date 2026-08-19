-- Los mensajes de error de la base se leen en el mostrador, no en un log: van
-- escritos como se habla. Faltaban acentos ("sin sesion", "el turno arranco") y
-- habia un "hasta que hora" que va con tilde porque pregunta.
--
-- Se regeneran las funciones tal cual estaban, cambiando solo los textos.

CREATE OR REPLACE FUNCTION public.abrir_turno(p_caja_grande integer, p_caja_chica integer, p_stock jsonb DEFAULT '[]'::jsonb, p_abierto_en timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_turno uuid;
  v_item jsonb;
  v_esperado integer;
  v_abierto timestamptz := coalesce(p_abierto_en, now());
  v_ultimo timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
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
    raise exception 'el turno anterior cerró %, no se puede arrancar antes',
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
$function$;

CREATE OR REPLACE FUNCTION public.anular_pago(p_pago_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;

  delete from public.pagos where id = p_pago_id;
  if not found then
    raise exception 'el pago no existe';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.borrar_movimiento(p_movimiento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;

  delete from public.movimientos_caja where id = p_movimiento_id;
  if not found then
    raise exception 'el movimiento no existe';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.borrar_venta(p_venta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_venta public.ventas%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'la venta no existe';
  end if;

  -- Los pagos apuntan a la venta: se van primero o la FK corta el borrado.
  delete from public.pagos where venta_id = p_venta_id;
  delete from public.ventas where id = p_venta_id;

  -- Anular ya habia devuelto el stock: sumarlo de nuevo lo dejaria de mas.
  if v_venta.anulada_en is null then
    update public.productos
       set stock = stock + v_venta.cantidad
     where id = v_venta.producto_id and stock is not null;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_turno(p_caja_grande integer, p_caja_chica integer, p_stock jsonb DEFAULT '[]'::jsonb, p_nota text DEFAULT NULL::text, p_cerrado_en timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_turno public.turno_actual%rowtype;
  v_item jsonb;
  v_esperado integer;
  v_cerrado timestamptz := coalesce(p_cerrado_en, now());
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  select * into v_turno from public.turno_actual;
  if not found then
    raise exception 'no hay ningún turno abierto';
  end if;
  if p_caja_grande is null or p_caja_chica is null then
    raise exception 'falta el conteo de alguna caja';
  end if;

  if v_cerrado > now() + interval '1 minute' then
    raise exception 'el turno no puede cerrar en el futuro';
  end if;
  if v_cerrado < v_turno.abierto_en then
    raise exception 'el turno arrancó %, no puede cerrar antes',
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
$function$;

CREATE OR REPLACE FUNCTION public.create_staff(p_email text, p_password text, p_role text DEFAULT 'employee'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := gen_random_uuid();
begin
  if p_role not in ('admin', 'employee') then
    raise exception 'rol inválido: %. Usar admin o employee.', p_role;
  end if;
  if length(p_password) < 8 then
    raise exception 'la contraseña debe tener al menos 8 caracteres';
  end if;

  -- Las columnas de token van en '' y no NULL: GoTrue las lee como string y
  -- revienta con "Database error querying schema" si encuentra NULL.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, email_change_token_current, phone_change,
    phone_change_token, reauthentication_token
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', p_role),
    '{}'::jsonb,
    now(),
    now(),
    '', '', '', '', '', '', '', ''
  );

  -- GoTrue espera una identity por proveedor; sin esto el login por password falla.
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    'email',
    jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(p_email)), 'email_verified', true),
    now(),
    now(),
    now()
  );

  return v_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.editar_salida(p_id uuid, p_salio timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_entro timestamptz;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if p_salio is null then
    raise exception 'poné hasta qué hora trabaja';
  end if;

  select entro into v_entro from public.asistencias where id = p_id;
  if not found then
    raise exception 'esa asistencia no existe';
  end if;
  if p_salio <= v_entro then
    raise exception 'entró %, no puede salir antes',
      to_char(v_entro at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI');
  end if;

  update public.asistencias set salio = p_salio where id = p_id;
exception
  -- La jornada estirada se pisa con otra de la misma persona. El error crudo de
  -- Postgres no dice nada util en el mostrador.
  when exclusion_violation then
    raise exception 'esa hora se pisa con otra jornada suya del mismo día';
end;
$function$;

CREATE OR REPLACE FUNCTION public.fichar_asistencia(p_empleado uuid, p_salida timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if p_empleado is null then
    raise exception 'elegí quién está fichando';
  end if;
  if p_salida is null then
    raise exception 'poné hasta qué hora trabaja';
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
$function$;

CREATE OR REPLACE FUNCTION public.registrar_cobro(p_alumno_id uuid, p_efectivo integer DEFAULT 0, p_transferencia integer DEFAULT 0)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_metodo public.metodo_pago;
  v_resto integer;
  v_aplicar integer;
  v_venta record;
  v_ultima uuid;
  v_saldo integer;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if coalesce(p_efectivo, 0) < 0 or coalesce(p_transferencia, 0) < 0 then
    raise exception 'los montos no pueden ser negativos';
  end if;
  if coalesce(p_efectivo, 0) + coalesce(p_transferencia, 0) = 0 then
    raise exception 'el cobro tiene que ser mayor a cero';
  end if;

  select id into v_ultima
    from public.ventas
   where alumno_id = p_alumno_id and anulada_en is null
   order by creado_en desc
   limit 1;
  if v_ultima is null then
    raise exception 'el alumno no tiene ventas donde imputar el cobro';
  end if;

  foreach v_metodo in array array['efectivo', 'transferencia']::public.metodo_pago[] loop
    v_resto := case
                 when v_metodo = 'efectivo' then coalesce(p_efectivo, 0)
                 else coalesce(p_transferencia, 0)
               end;

    for v_venta in
      select v.id,
             (v.total - coalesce((select sum(pg.monto) from public.pagos pg where pg.venta_id = v.id), 0))
               as saldo
        from public.ventas v
       where v.alumno_id = p_alumno_id and v.anulada_en is null
       order by v.creado_en
    loop
      exit when v_resto <= 0;
      continue when v_venta.saldo <= 0;

      v_aplicar := least(v_resto, v_venta.saldo);
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_venta.id, v_aplicar, v_metodo, auth.uid());
      v_resto := v_resto - v_aplicar;
    end loop;

    -- Pago de mas: no hay a donde imputarlo, queda a favor sobre la ultima venta.
    if v_resto > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_ultima, v_resto, v_metodo, auth.uid());
    end if;
  end loop;

  select saldo into v_saldo from public.alumnos_cuenta where id = p_alumno_id;
  return v_saldo;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_lote(p_ventas jsonb DEFAULT '[]'::jsonb, p_movimientos jsonb DEFAULT '[]'::jsonb, p_cobros jsonb DEFAULT '[]'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_item jsonb;
  v_cargados integer := 0;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;

  if jsonb_typeof(p_ventas) = 'array' and jsonb_array_length(p_ventas) > 0 then
    v_cargados := public.registrar_ventas(p_ventas);
  end if;

  if jsonb_typeof(p_movimientos) = 'array' then
    for v_item in select * from jsonb_array_elements(p_movimientos) loop
      perform public.registrar_movimiento(
        (v_item ->> 'tipo')::public.movimiento_tipo,
        (v_item ->> 'monto')::integer,
        v_item ->> 'motivo',
        coalesce((v_item ->> 'caja')::public.caja, 'grande'),
        coalesce((v_item ->> 'metodo')::public.metodo_pago, 'efectivo')
      );
      v_cargados := v_cargados + 1;
    end loop;
  end if;

  if jsonb_typeof(p_cobros) = 'array' then
    for v_item in select * from jsonb_array_elements(p_cobros) loop
      perform public.registrar_cobro(
        (v_item ->> 'alumno_id')::uuid,
        coalesce((v_item ->> 'efectivo')::integer, 0),
        coalesce((v_item ->> 'transferencia')::integer, 0)
      );
      v_cargados := v_cargados + 1;
    end loop;
  end if;

  if v_cargados = 0 then
    raise exception 'no hay nada para cargar';
  end if;

  return v_cargados;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_movimiento(p_tipo movimiento_tipo, p_monto integer, p_motivo text, p_caja caja DEFAULT 'grande'::caja, p_metodo metodo_pago DEFAULT 'efectivo'::metodo_pago)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
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
$function$;

CREATE OR REPLACE FUNCTION public.registrar_pago(p_venta_id uuid, p_monto integer, p_metodo metodo_pago)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_total integer;
  v_pagado integer;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if p_monto <= 0 then
    raise exception 'el monto tiene que ser mayor a cero';
  end if;

  select total into v_total
    from public.ventas
   where id = p_venta_id and anulada_en is null
   for update;
  if not found then
    raise exception 'la venta no existe o está anulada';
  end if;

  insert into public.pagos (venta_id, monto, metodo, creado_por)
  values (p_venta_id, p_monto, p_metodo, auth.uid());

  select coalesce(sum(monto), 0) into v_pagado from public.pagos where venta_id = p_venta_id;
  return v_total - v_pagado;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_ventas(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_item jsonb;
  v_producto public.productos%rowtype;
  v_cantidad smallint;
  v_venta_id uuid;
  v_efectivo integer;
  v_transferencia integer;
  v_no_paga integer;
  v_cargadas integer := 0;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no hay ventas para cargar';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::smallint, 1);
    v_efectivo := coalesce((v_item ->> 'efectivo')::integer, 0);
    v_transferencia := coalesce((v_item ->> 'transferencia')::integer, 0);
    v_no_paga := coalesce((v_item ->> 'no_paga')::integer, 0);

    if v_efectivo < 0 or v_transferencia < 0 or v_no_paga < 0 then
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
      raise exception 'el producto % está desactivado', v_producto.nombre;
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
    if v_no_paga > 0 then
      insert into public.pagos (venta_id, monto, metodo, creado_por)
      values (v_venta_id, v_no_paga, 'no_paga', auth.uid());
    end if;

    if v_producto.stock is not null then
      update public.productos set stock = stock - v_cantidad where id = v_producto.id;
    end if;

    v_cargadas := v_cargadas + 1;
  end loop;

  return v_cargadas;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sellar_turno()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_turno uuid;
begin
  select id into v_turno from public.turnos where cerrado_en is null;
  if v_turno is null then
    raise exception 'no hay un turno abierto: iniciá turno para cargar movimientos';
  end if;
  new.turno_id := v_turno;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_role(p_email text, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_role not in ('admin', 'employee') then
    raise exception 'rol inválido: %. Usar admin o employee.', p_role;
  end if;

  update auth.users
     set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p_role),
         updated_at = now()
   where email = lower(trim(p_email));

  if not found then
    raise exception 'no existe una cuenta con el email %', p_email;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sumar_stock(p_producto_id uuid, p_cantidad integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_stock integer;
begin
  if auth.uid() is null then
    raise exception 'sin sesión';
  end if;
  if p_cantidad = 0 then
    raise exception 'la cantidad tiene que ser distinta de cero';
  end if;

  select stock into v_stock from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'el producto no existe';
  end if;
  if v_stock is null then
    raise exception 'ese producto no lleva stock';
  end if;
  if v_stock + p_cantidad < 0 then
    raise exception 'no podés dejar el stock en negativo';
  end if;

  update public.productos set stock = stock + p_cantidad where id = p_producto_id
  returning stock into v_stock;
  return v_stock;
end;
$function$;
