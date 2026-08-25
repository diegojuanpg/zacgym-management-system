-- Lo que quedo mal cargado antes de que la imputacion existiera.
--
-- El mostrador ya descontaba el saldo a favor de lo que cobraba, asi que esas
-- ventas entraron impagas y la plata a favor siguio colgada en la venta vieja:
-- la fila decia "Debe" con una deuda que no existia. Se imputan ahora con la
-- misma regla que usa `aplicar_a_favor`, de la venta mas vieja a la mas nueva.
--
-- Va en su propia migracion porque el valor 'a_favor' del enum se agrego en la
-- anterior y Postgres no lo deja usar en la misma transaccion en que nacio.
--
-- El asiento se guarda con el turno y el usuario de la venta que lo usa, no con
-- los de ahora: no tiene por que aparecer en el turno que este abierto hoy. Para
-- eso hay que sacar de encima el trigger que sella el turno.

alter table public.pagos disable trigger pagos_sella_turno;

do $$
declare
  v_venta record;
  v_credito record;
  v_resto integer;
  v_aplicar integer;
  v_pago_id uuid;
begin
  for v_venta in
    select v.id, v.alumno_id, v.turno_id, v.creado_por, v.creado_en,
           (v.total - coalesce(sum(pg.monto), 0))::integer as debe
      from public.ventas v
      left join public.pagos pg on pg.venta_id = v.id
     where v.anulada_en is null
     group by v.id, v.alumno_id, v.turno_id, v.creado_por, v.creado_en, v.total
    having v.total - coalesce(sum(pg.monto), 0) > 0
     order by v.creado_en
  loop
    v_resto := v_venta.debe;

    for v_credito in
      select v.id, (sum(pg.monto) - v.total)::integer as sobra
        from public.ventas v
        join public.pagos pg on pg.venta_id = v.id
       where v.alumno_id = v_venta.alumno_id
         and v.anulada_en is null
         and v.id <> v_venta.id
       group by v.id, v.total, v.creado_en
      having sum(pg.monto) > v.total
       order by v.creado_en
    loop
      exit when v_resto <= 0;
      v_aplicar := least(v_resto, v_credito.sobra);

      insert into public.pagos (venta_id, monto, metodo, creado_por, turno_id, creado_en)
      values (v_venta.id, v_aplicar, 'a_favor', v_venta.creado_por, v_venta.turno_id, v_venta.creado_en)
      returning id into v_pago_id;

      insert into public.pagos (venta_id, monto, metodo, creado_por, turno_id, creado_en, contraparte_id)
      values (v_credito.id, -v_aplicar, 'a_favor', v_venta.creado_por, v_venta.turno_id,
              v_venta.creado_en, v_pago_id);

      v_resto := v_resto - v_aplicar;
    end loop;
  end loop;
end $$;

alter table public.pagos enable trigger pagos_sella_turno;
