-- Dias que tienen ventas cargadas, en hora de Buenos Aires. El selector del
-- mostrador solo deja elegir estos: si un dia no tiene movimientos, no hay nada
-- que mirar.
create view public.dias_con_ventas as
  select distinct (creado_en at time zone 'America/Argentina/Buenos_Aires')::date as dia
    from public.ventas;

grant select on public.dias_con_ventas to authenticated;
