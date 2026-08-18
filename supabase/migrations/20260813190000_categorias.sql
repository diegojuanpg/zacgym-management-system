-- Rubros del catalogo. Los productos que ya estaban quedan sin categoria hasta
-- que alguien los clasifique: adivinar por el nombre saldria mal.
create type public.categoria_producto as enum ('mensualidad', 'consumible', 'suplemento');

alter table public.productos add column categoria public.categoria_producto;

comment on column public.productos.categoria is
  'Rubro: mensualidad, consumible o suplemento. null = todavia sin clasificar.';
