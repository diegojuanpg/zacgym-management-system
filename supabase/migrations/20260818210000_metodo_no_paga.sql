-- "No paga": lo que se lleva el dueño. Sale del stock, no entra plata y nadie
-- queda debiendo. Va como forma de pago y no como precio cero para no perder
-- cuanto vale lo que se saco.
--
-- Solo el alter: Postgres no deja usar un valor nuevo del enum en la misma
-- transaccion en que se agrega, y el resto (la funcion y la vista) lo usa.
alter type public.metodo_pago add value if not exists 'no_paga';
