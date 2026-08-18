-- Que productos entran al conteo de turno.
--
-- Contar los 43 que llevan stock, dos veces por turno, son 86 numeros: nadie lo
-- hace, y un conteo que no se hace no detecta nada. La lista la arma quien
-- conoce el mostrador, marcando en el catalogo lo que vale la pena contar
-- (las proteinas de $69.000 si; el agua de $1.000 es decision suya).
--
-- Arranca en false a proposito: es mas claro que el turno diga "no hay nada
-- marcado para contar" a que aparezcan 43 campos obligatorios el primer dia.

alter table public.productos
  add column contar_en_turno boolean not null default false;

comment on column public.productos.contar_en_turno is
  'Si entra al conteo obligatorio de apertura y cierre de turno. Solo tiene sentido con stock no nulo.';

-- Sin stock no hay unidades que contar; el flag ahi no significa nada.
alter table public.productos
  add constraint productos_contar_necesita_stock
  check (not contar_en_turno or stock is not null);
