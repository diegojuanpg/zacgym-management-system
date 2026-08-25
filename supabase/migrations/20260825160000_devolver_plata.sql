-- Devolver plata: la venta salio 45.000, el alumno pago con 50.000 y no habia
-- vuelto. Esos 5.000 le quedaron a favor y ahora se los damos.
--
-- Son dos hechos distintos y se escriben por separado:
--   * la plata sale del cajon hoy    -> un egreso en movimientos_caja
--   * la cuenta del alumno se achica -> un pago NEGATIVO sobre la venta donde
--                                        habia quedado el excedente
--
-- El pago negativo va con metodo 'a_favor' porque no es plata que entra ni sale
-- de una caja: la caja ya la mueve el egreso. Todas las vistas de recaudacion y
-- de cajon ya ignoran ese metodo, asi que la plata se cuenta una sola vez.
--
-- No se toca el pago original de 50.000: ese dia cerro con esa recaudacion. La
-- plata entro aquel dia y sale hoy, son dos filas, no una corregida.

-- El asiento de la cuenta cuelga del egreso que lo pago: borrar el movimiento
-- desde el mostrador devuelve el saldo a favor solo, sin dejar la plata en el
-- aire. Es el mismo mecanismo que usa contraparte_id para las imputaciones.
alter table public.pagos
  add column movimiento_id uuid references public.movimientos_caja(id) on delete cascade;

comment on column public.pagos.movimiento_id is
  'Egreso de caja que devolvio esta plata. Borrarlo devuelve el saldo a favor.';

/**
 * Una devolucion tiene respaldo propio: la plata salio del cajon. Que se caiga
 * el pago que habia dejado el saldo a favor no la hace desaparecer —el alumno
 * ya se la llevo—, asi que el trigger que suelta las imputaciones tiene que
 * dejarla donde esta.
 */
create or replace function public.soltar_a_favor()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.monto < 0 then
    delete from public.pagos where id = old.contraparte_id;
  else
    -- Se fue plata de esta venta: las imputaciones que salieron de aca quedan
    -- sin respaldo. Se sueltan todas, aunque sobrara para cubrir alguna: es una
    -- correccion a mano y arreglar de mas es peor que dejarlo pendiente.
    delete from public.pagos
     where venta_id = old.venta_id and monto < 0 and movimiento_id is null;
  end if;
  return null;
end;
$$;

-- Se agrega p_alumno_id, asi que hay que soltar la firma vieja: dejarla haria
-- ambigua la llamada de cinco argumentos.
drop function if exists public.registrar_movimiento(
  public.movimiento_tipo, integer, text, public.caja, public.metodo_pago
);

/**
 * Plata que entra o sale sin ser una venta. Con p_alumno_id es una devolucion:
 * ademas del egreso, le descuenta el saldo a favor.
 *
 * Se descuenta de la venta mas vieja donde haya quedado plata de mas, igual que
 * un cobro se imputa a la compra impaga mas vieja. Si se devuelve mas de lo que
 * tenia a favor, el excedente le queda como deuda sobre su ultima venta —el
 * mismo lugar donde un cobro de mas le queda a favor.
 */
create or replace function public.registrar_movimiento(
  p_tipo public.movimiento_tipo,
  p_monto integer,
  p_motivo text,
  p_caja public.caja default 'grande',
  p_metodo public.metodo_pago default 'efectivo',
  p_alumno_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_credito record;
  v_ultima uuid;
  v_resto integer;
  v_aplicar integer;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
  end if;
  if p_monto <= 0 then
    raise exception 'el monto tiene que ser mayor a cero';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'hace falta un motivo';
  end if;
  if p_alumno_id is not null and p_tipo <> 'egreso' then
    raise exception 'una devolucion es plata que sale del cajon';
  end if;

  insert into public.movimientos_caja (tipo, caja, metodo, monto, motivo, creado_por)
  values (p_tipo, p_caja, p_metodo, p_monto, trim(p_motivo), auth.uid())
  returning id into v_id;

  if p_alumno_id is null then
    return v_id;
  end if;

  select id into v_ultima
    from public.ventas
   where alumno_id = p_alumno_id and anulada_en is null
   order by creado_en desc
   limit 1;
  if v_ultima is null then
    raise exception 'el alumno no tiene ventas donde descontar la devolucion';
  end if;

  v_resto := p_monto;

  for v_credito in
    select v.id,
           (sum(pg.monto) - v.total)::integer as sobra
      from public.ventas v
      join public.pagos pg on pg.venta_id = v.id
     where v.alumno_id = p_alumno_id
       and v.anulada_en is null
     group by v.id, v.total, v.creado_en
    having sum(pg.monto) > v.total
     order by v.creado_en
  loop
    exit when v_resto <= 0;
    v_aplicar := least(v_resto, v_credito.sobra);

    insert into public.pagos (venta_id, monto, metodo, creado_por, movimiento_id)
    values (v_credito.id, -v_aplicar, 'a_favor', auth.uid(), v_id);

    v_resto := v_resto - v_aplicar;
  end loop;

  -- Se devolvio mas de lo que tenia a favor: el resto le queda debiendo.
  if v_resto > 0 then
    insert into public.pagos (venta_id, monto, metodo, creado_por, movimiento_id)
    values (v_ultima, -v_resto, 'a_favor', auth.uid(), v_id);
  end if;

  return v_id;
end;
$$;

grant execute on function public.registrar_movimiento(
  public.movimiento_tipo, integer, text, public.caja, public.metodo_pago, uuid
) to authenticated;

-- El lote pasa el alumno cuando el movimiento es una devolucion.
create or replace function public.registrar_lote(
  p_ventas jsonb default '[]'::jsonb,
  p_movimientos jsonb default '[]'::jsonb,
  p_cobros jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_cargados integer := 0;
begin
  if auth.uid() is null then
    raise exception 'sin sesion';
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
        coalesce((v_item ->> 'metodo')::public.metodo_pago, 'efectivo'),
        (v_item ->> 'alumno_id')::uuid
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
$$;
