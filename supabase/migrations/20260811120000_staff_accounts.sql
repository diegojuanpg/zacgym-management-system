-- Cuentas de staff. No hay signup publico: las cuentas se crean a mano con esta funcion.
--
--   select public.create_staff('diego@zacgym.com', 'una-password-larga', 'admin');
--   select public.create_staff('sole@zacgym.com', 'otra-password', 'employee');
--
-- El rol vive en auth.users.raw_app_meta_data->>'role', asi viaja dentro del JWT
-- y no hace falta ni tabla de perfiles ni un join en cada request.

create or replace function public.create_staff(
  p_email text,
  p_password text,
  p_role text default 'employee'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := gen_random_uuid();
begin
  if p_role not in ('admin', 'employee') then
    raise exception 'rol invalido: %. Usar admin o employee.', p_role;
  end if;
  if length(p_password) < 8 then
    raise exception 'la password debe tener al menos 8 caracteres';
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
$$;

revoke execute on function public.create_staff(text, text, text) from anon, authenticated;

-- Cambiar el rol de una cuenta ya creada.
create or replace function public.set_staff_role(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role not in ('admin', 'employee') then
    raise exception 'rol invalido: %. Usar admin o employee.', p_role;
  end if;

  update auth.users
     set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p_role),
         updated_at = now()
   where email = lower(trim(p_email));

  if not found then
    raise exception 'no existe una cuenta con el email %', p_email;
  end if;
end;
$$;

revoke execute on function public.set_staff_role(text, text) from anon, authenticated;
