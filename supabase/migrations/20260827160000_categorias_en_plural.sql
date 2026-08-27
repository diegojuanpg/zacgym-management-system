-- Las categorias del catalogo, en plural.
--
-- La categoria agrupa muchos productos, asi que su nombre tiene que hablar de
-- muchos: "Mensualidades" y no "Mensualidad". El nombre se muestra tal cual en
-- las solapas de Productos, en las de Ventas y en la referencia del grafico, asi
-- que renombrarlo aca arregla las tres de una: ninguna guarda su propia copia.
--
-- `ventas_por_dia` y `ventas_saldo` sacan el rubro de un join contra productos,
-- no de una columna copiada, asi que siguen el cambio solas.
update public.productos set categoria = 'consumibles'   where categoria = 'consumible';
update public.productos set categoria = 'mensualidades' where categoria = 'mensualidad';
update public.productos set categoria = 'suplementos'   where categoria = 'suplemento';
