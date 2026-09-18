-- Datos de demostracion, para las capturas y los GIFs de la documentacion.
--
-- Todo lo de aca adentro es inventado: ningun alumno, empleado, venta ni importe
-- corresponde a una persona real. Los mails son @example.com y los telefonos
-- caen en el rango 555-01xx, que no existe.
--
-- Uso:
--   pnpm db:reset
--   docker exec -i supabase_db_zacgym-management-system psql -U postgres -d postgres < supabase/demo/seed-demo.sql
--
-- Login de la demo: demo@zacgym.test / demo-zacgym-2026

begin;

-- ============================== staff ==============================

do $$
begin
  if not exists (select 1 from auth.users where email = 'demo@zacgym.test') then
    perform public.create_staff('demo@zacgym.test', 'demo-zacgym-2026', 'admin');
  end if;
end $$;

insert into public.empleados (nombre) values
  ('Sol Vera'), ('Nico Ruiz'), ('Ana Ferrari')
on conflict (nombre) do nothing;

-- ============================== alumnos ==============================

-- seed.sql deja unos alumnos de relleno ("Perez, Juan") hasta importar el
-- listado real. En la demo estorban: se los reconoce porque no tienen mail.
delete from public.alumnos where email is null;

insert into public.alumnos (apellido, nombre, email, celular, nacimiento, genero) values
  ('Acosta',   'Bruno',    'bruno.acosta@example.com',     '+54 9 351 555-0101', '1994-03-12', 'masculino'),
  ('Aguirre',  'Camila',   'camila.aguirre@example.com',   '+54 9 351 555-0102', '1999-07-04', 'femenino'),
  ('Arias',    'Tomas',    'tomas.arias@example.com',      '+54 9 351 555-0103', '1988-11-23', 'masculino'),
  ('Barrios',  'Lucia',    'lucia.barrios@example.com',    '+54 9 351 555-0104', '2001-01-30', 'femenino'),
  ('Benitez',  'Ivan',     'ivan.benitez@example.com',     '+54 9 351 555-0105', '1996-05-18', 'masculino'),
  ('Cabrera',  'Sofia',    'sofia.cabrera@example.com',    '+54 9 351 555-0106', '1992-09-09', 'femenino'),
  ('Castro',   'Julian',   'julian.castro@example.com',    '+54 9 351 555-0107', '1985-02-27', 'masculino'),
  ('Coria',    'Malena',   'malena.coria@example.com',     '+54 9 351 555-0108', '2000-12-15', 'femenino'),
  ('Duarte',   'Facundo',  'facundo.duarte@example.com',   '+54 9 351 555-0109', '1997-08-21', 'masculino'),
  ('Escobar',  'Renata',   'renata.escobar@example.com',   '+54 9 351 555-0110', '1993-04-06', 'femenino'),
  ('Ferreyra', 'Gonzalo',  'gonzalo.ferreyra@example.com', '+54 9 351 555-0111', '1990-10-11', 'masculino'),
  ('Gomez',    'Abril',    'abril.gomez@example.com',      '+54 9 351 555-0112', '2002-06-02', 'femenino'),
  ('Herrera',  'Matias',   'matias.herrera@example.com',   '+54 9 351 555-0113', '1995-03-29', 'masculino'),
  ('Ibarra',   'Victoria', 'victoria.ibarra@example.com',  '+54 9 351 555-0114', '1998-01-17', 'femenino'),
  ('Juarez',   'Emiliano', 'emiliano.juarez@example.com',  '+54 9 351 555-0115', '1987-07-25', 'masculino'),
  ('Ledesma',  'Paula',    'paula.ledesma@example.com',    '+54 9 351 555-0116', '1991-11-08', 'femenino'),
  ('Maidana',  'Santiago', 'santiago.maidana@example.com', '+54 9 351 555-0117', '1999-09-14', 'masculino'),
  ('Medina',   'Julieta',  'julieta.medina@example.com',   '+54 9 351 555-0118', '1994-05-03', 'femenino'),
  ('Molina',   'Ramiro',   'ramiro.molina@example.com',    '+54 9 351 555-0119', '1989-12-20', 'masculino'),
  ('Navarro',  'Belen',    'belen.navarro@example.com',    '+54 9 351 555-0120', '2003-02-11', 'femenino'),
  ('Ojeda',    'Nahuel',   'nahuel.ojeda@example.com',     '+54 9 351 555-0121', '1996-08-07', 'masculino'),
  ('Paz',      'Guadalupe','guadalupe.paz@example.com',    '+54 9 351 555-0122', '1993-10-26', 'femenino'),
  ('Quiroga',  'Leandro',  'leandro.quiroga@example.com',  '+54 9 351 555-0123', '1986-04-19', 'masculino'),
  ('Ramos',    'Agustina', 'agustina.ramos@example.com',   '+54 9 351 555-0124', '2000-07-31', 'femenino'),
  ('Rios',     'Thiago',   'thiago.rios@example.com',      '+54 9 351 555-0125', '2004-03-05', 'masculino'),
  ('Rojas',    'Milagros', 'milagros.rojas@example.com',   '+54 9 351 555-0126', '1997-01-22', 'femenino'),
  ('Sosa',     'Ezequiel', 'ezequiel.sosa@example.com',    '+54 9 351 555-0127', '1992-06-13', 'masculino'),
  ('Suarez',   'Delfina',  'delfina.suarez@example.com',   '+54 9 351 555-0128', '1995-09-28', 'femenino'),
  ('Torres',   'Joaquin',  'joaquin.torres@example.com',   '+54 9 351 555-0129', '1990-02-16', 'masculino'),
  ('Vera',     'Catalina', 'catalina.vera@example.com',    '+54 9 351 555-0130', '2001-11-01', 'femenino'),
  ('Villalba', 'Lautaro',  'lautaro.villalba@example.com', '+54 9 351 555-0131', '1998-05-24', 'masculino'),
  ('Zarate',   'Morena',   'morena.zarate@example.com',    '+54 9 351 555-0132', '2002-08-10', 'femenino')
on conflict (apellido, nombre) do nothing;

-- Id de PulsoFlow y de la planilla: en produccion los traen los pipelines.
with numerados as (
  select id, lpad((row_number() over (order by nombre_completo))::text, 4, '0') as n
    from public.alumnos
)
update public.alumnos a
   set tracking_id = 'pf-' || numerados.n,
       sheet_id = 'sheet-demo-' || numerados.n
  from numerados
 where a.id = numerados.id and a.tracking_id is null;

-- ============================== lo que baja de PulsoFlow ==============================

-- Vencimientos escalonados: la mayoria al dia, unos pocos vencidos.
insert into public.alumnos_tracking
  (id, nombre, gmail, numero, sheet_id, dias_entrenamiento, ultimo_checkin,
   vencimiento, estado, activo, ultima_rutina_semana)
select a.tracking_id,
       a.nombre || ' ' || a.apellido,
       a.email,
       a.celular,
       a.sheet_id,
       2 + (abs(hashtext(a.tracking_id)) % 4),
       (current_date - (abs(hashtext(a.tracking_id)) % 5))::timestamptz,
       (current_date + (case when abs(hashtext(a.tracking_id)) % 10 = 0 then -12
                             when abs(hashtext(a.tracking_id)) % 10 = 1 then -3
                             else (abs(hashtext(a.tracking_id)) % 28) end))::timestamptz,
       case when abs(hashtext(a.tracking_id)) % 10 in (0, 1) then 'EXPIRED' else 'ACTIVE' end,
       true,
       date_trunc('week', current_date)::date
  from public.alumnos a
on conflict (id) do nothing;

update public.alumnos
   set rutina_semana = date_trunc('week', current_date)::date,
       rutina_leida_en = now() - interval '6 hours'
 where rutina_semana is null;

-- Dos con la planilla a medio actualizar: es el caso "Revisar".
update public.alumnos
   set rutina_semana = null, rutina_estado = 'Revisar'
 where apellido in ('Coria', 'Quiroga');

-- ============================== check-ins ==============================

-- Ocho semanas de asistencias. Cada alumno viene los dias que tiene asignados,
-- con algo de ruido: esto es lo que lee la corrida semanal de rutinas.
insert into public.check_ins
  (id, check_in_time, status, user_id, user_name, user_email, membership_id,
   membership_duration_days, branch_id, activity_type, created_at, service_id, raw)
select 'ci-' || a.tracking_id || '-' || to_char(d.dia, 'YYYYMMDD'),
       d.dia + time '07:00' + ((abs(hashtext(a.tracking_id || d.dia::text)) % 780) * interval '1 minute'),
       'COMPLETED',
       a.tracking_id,
       a.nombre || ' ' || a.apellido,
       a.email,
       'mem-' || a.tracking_id,
       30,
       'branch-demo',
       'GYM',
       d.dia::timestamptz,
       'service-demo',
       jsonb_build_object('demo', true)
  from public.alumnos a
  join public.alumnos_tracking t on t.id = a.tracking_id
  cross join lateral (
    select generate_series(current_date - 55, current_date - 1, interval '1 day')::date as dia
  ) d
 where extract(dow from d.dia) <> 0
   and (abs(hashtext(a.tracking_id || d.dia::text)) % 6) < t.dias_entrenamiento
on conflict (id) do nothing;

-- ============================== turnos, ventas y caja ==============================

-- Lo que se cuenta en cada cierre. En produccion se marca desde Productos; son
-- pocos a proposito: contar 43 cosas por turno no lo hace nadie.
update public.productos
   set contar_en_turno = true
 where nombre in ('Agua 600ml', 'Monster', 'Que Lo Paleo NEGRA', 'Que Lo Paleo BLANCA');

-- Los triggers sellan cada movimiento con el turno abierto en ese momento. Para
-- el historico de la demo los ponemos a mano, asi que se apagan mientras dura.
alter table public.ventas disable trigger ventas_sella_turno;
alter table public.pagos disable trigger pagos_sella_turno;
alter table public.movimientos_caja disable trigger movimientos_sella_turno;

do $$
declare
  v_user uuid := (select id from auth.users where email = 'demo@zacgym.test');
  v_emp uuid;
  v_dia date;
  v_turno uuid;
  v_venta uuid;
  v_alumno uuid;
  v_prod uuid;
  v_precio integer;
  v_i integer;
  v_cobrado integer;
begin
  for v_dia in select generate_series(current_date - 6, current_date, interval '1 day')::date loop
    v_emp := (select id from public.empleados order by nombre
               offset (abs(hashtext(v_dia::text)) % 3) limit 1);

    insert into public.turnos (abierto_en, abierto_por, caja_grande_inicial, caja_chica_inicial)
    values (v_dia + time '08:00', v_user, 120000, 15000)
    returning id into v_turno;

    -- El responsable del turno es quien ficho esa jornada.
    insert into public.asistencias (empleado_id, entro, inicia, termina, creado_por)
    values (v_emp, v_dia + time '08:00', v_dia + time '08:00',
            case when v_dia = current_date then null else v_dia + time '22:30' end,
            v_user);

    -- Conteo de apertura de los productos que llevan stock.
    insert into public.turno_stock (turno_id, producto_id, momento, contado, esperado)
    select v_turno, p.id, 'apertura', p.stock, p.stock
      from public.productos p
     where p.stock is not null and p.stock > 0;

    v_cobrado := 0;
    for v_i in 1 .. (8 + abs(hashtext(v_dia::text)) % 7) loop
      select id into v_alumno from public.alumnos
       order by md5(v_dia::text || v_i::text || id::text) limit 1;

      -- Una de cada cuatro es cuota; el resto, kiosco.
      if v_i % 4 = 0 then
        select id, precio into v_prod, v_precio from public.productos where nombre = 'Cuota';
      else
        select id, precio into v_prod, v_precio from public.productos
         where stock is not null and activo and stock > 0
         order by md5(v_dia::text || v_i::text || id::text) limit 1;
      end if;

      continue when v_prod is null;

      insert into public.ventas
        (alumno_id, producto_id, cantidad, precio_unitario, creado_por, creado_en, turno_id)
      values (v_alumno, v_prod, 1, v_precio, v_user,
              v_dia + time '09:00' + (v_i * interval '37 minutes'), v_turno)
      returning id into v_venta;

      -- Una de cada seis queda fiada: es la deuda que despues se ve en la ficha.
      if v_i % 6 <> 0 then
        insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en, turno_id)
        values (v_venta, v_precio,
                (case when v_i % 3 = 0 then 'transferencia' else 'efectivo' end)::public.metodo_pago,
                v_user, v_dia + time '09:00' + (v_i * interval '37 minutes'), v_turno);
        if v_i % 3 <> 0 then
          v_cobrado := v_cobrado + v_precio;
        end if;
      end if;

      update public.productos set stock = greatest(stock - 1, 0)
       where id = v_prod and stock is not null;
    end loop;

    -- Un egreso de caja chica cada tantos dias.
    if abs(hashtext(v_dia::text)) % 3 = 0 then
      insert into public.movimientos_caja
        (tipo, caja, metodo, monto, motivo, creado_por, creado_en, turno_id)
      values ('egreso', 'chica', 'efectivo', 8000, 'Articulos de limpieza',
              v_user, v_dia + time '17:20', v_turno);
    end if;

    -- El turno de hoy queda abierto: es el que muestra el mostrador.
    continue when v_dia = current_date;

    -- Cierre: lo contado contra lo esperado. Un dia falta plata, otro faltan aguas.
    insert into public.turno_stock (turno_id, producto_id, momento, contado, esperado)
    select v_turno, p.id, 'cierre',
           case when p.nombre = 'Agua 600ml' and abs(hashtext(v_dia::text)) % 4 = 0
                then greatest(p.stock - 2, 0) else p.stock end,
           p.stock
      from public.productos p
     where p.stock is not null and p.stock > 0;

    update public.turnos
       set cerrado_en = v_dia + time '22:30',
           cerrado_por = v_user,
           caja_grande_esperada = 120000 + v_cobrado,
           caja_grande_final = 120000 + v_cobrado
                             - (case when abs(hashtext(v_dia::text)) % 5 = 0 then 3000 else 0 end),
           caja_chica_esperada = 15000 - (case when abs(hashtext(v_dia::text)) % 3 = 0 then 8000 else 0 end),
           caja_chica_final = 15000 - (case when abs(hashtext(v_dia::text)) % 3 = 0 then 8000 else 0 end),
           nota_cierre = case when abs(hashtext(v_dia::text)) % 5 = 0
                              then 'Faltaron $3.000 en la caja grande, revisar.' end
     where id = v_turno;
  end loop;
end $$;

alter table public.ventas enable trigger ventas_sella_turno;
alter table public.pagos enable trigger pagos_sella_turno;
alter table public.movimientos_caja enable trigger movimientos_sella_turno;

-- ============================== tareas ==============================

insert into public.tarea_categorias (nombre) values
  ('Cobranza'), ('Rutina'), ('Mostrador')
on conflict (nombre) do nothing;

insert into public.tareas (alumno_id, categoria_id, detalle, creado_por, creado_en)
select a.id,
       (select id from public.tarea_categorias where nombre = t.cat),
       t.detalle,
       (select id from auth.users where email = 'demo@zacgym.test'),
       now() - (t.dias * interval '1 day')
  from (values
        ('Acosta',  'Cobranza',  'Debe la cuota de este mes, avisarle cuando venga.', 2),
        ('Coria',   'Rutina',    'La planilla quedo con dos bloques abiertos, revisar.', 1),
        ('Quiroga', 'Rutina',    'Pidio pasar a 4 dias, actualizarle la rutina.', 3),
        ('Medina',  'Mostrador', 'Encargo una proteina, avisarle cuando llegue.', 1),
        ('Torres',  'Cobranza',  'Pago dos veces la cuota, descontarle la que sigue.', 4)
       ) as t(apellido, cat, detalle, dias)
  join public.alumnos a on a.apellido = t.apellido;

-- ============================== promos ==============================

insert into public.promos (nombre, producto_id)
select 'Familia Gomez', id from public.productos where nombre = 'Promo Fliar x3'
on conflict (nombre) do nothing;

insert into public.promo_integrantes (promo_id, alumno_id)
select (select id from public.promos where nombre = 'Familia Gomez'), a.id
  from public.alumnos a
 where a.apellido in ('Gomez', 'Rojas', 'Vera')
on conflict do nothing;

-- ============================== corridas de los pipelines ==============================

-- Lo que la pantalla de Pipelines muestra como ultima corrida de cada uno.
insert into public.pipeline_logs (run_id, pipeline, nivel, mensaje, created_at)
select p.run, p.pipeline, p.nivel, p.mensaje, p.cuando
  from (values
        ('run-h1',  'syncCheckins',    'info', 'Check-ins procesados: 34',            now() - interval '35 minutes'),
        ('run-h1',  'syncMembers',     'info', 'Socios procesados: 32',               now() - interval '34 minutes'),
        ('run-h1',  'rebuildTracking', 'info', 'alumnos_tracking reconstruida.',      now() - interval '34 minutes'),
        ('run-h0',  'syncCheckins',    'info', 'Check-ins procesados: 51',            now() - interval '95 minutes'),
        ('run-h0',  'syncMembers',     'info', 'Socios procesados: 32',               now() - interval '94 minutes'),
        ('run-h0',  'rebuildTracking', 'info', 'alumnos_tracking reconstruida.',      now() - interval '94 minutes'),
        ('run-sid', 'sheetIds',        'info', 'Barrido de Drive: 32 planillas, 32 con dueno.',  now() - interval '9 hours'),
        ('run-dia', 'dias',            'info', 'Dias contados: 30 planillas, 2 pendientes.',     now() - interval '8 hours'),
        ('run-sem', 'semanaRutina',    'warn', 'Coria, Malena: dos bloques visibles -> Revisar', now() - interval '4 hours'),
        ('run-sem', 'semanaRutina',    'info', 'Semanas leidas: 30',                  now() - interval '4 hours'),
        ('run-rut', 'rutinas',         'info', 'Avanzados: 27 | Repiten: 3 | Fallados: 0',       now() - interval '3 days')
       ) as p(run, pipeline, nivel, mensaje, cuando);

commit;
