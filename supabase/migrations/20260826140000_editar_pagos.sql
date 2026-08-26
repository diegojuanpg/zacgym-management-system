-- Editar el metodo de pago de una venta desde el mostrador no hacia nada.
--
-- `pagos` tiene RLS con policies de select, insert y delete, pero ninguna de
-- update. Sin policy el update no falla: no encuentra ninguna fila que le
-- corresponda, PostgREST contesta que todo bien y la pantalla vuelve al valor
-- viejo en cuanto recarga. Se ve como "lo edito y se revierte solo".
--
-- Lo mismo tapaba algo peor: al editar el monto de una venta se actualizaba
-- `ventas` —que si tiene policy— y no `pagos`, asi que la venta quedaba con
-- otro total y el pago viejo, inventando una deuda que nadie tenia.
create policy staff_edita_pagos on public.pagos for update to authenticated
  using (true) with check (true);
