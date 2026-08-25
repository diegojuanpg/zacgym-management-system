-- La cuenta corriente tardaba 1,8 segundos.
--
-- `alumnos_cuenta` cruza cada alumno con sus ventas y sus pagos, y `ventas`
-- no tenia indice por alumno: para cada uno de los 1959 alumnos Postgres leia
-- las 5688 ventas enteras, dos veces (una para lo comprado y otra para lo
-- pagado). Once millones de filas por pantalla.
--
-- Con el indice, lo mismo tarda 40 ms. Se nota en Alumnos y en Mostrador, que
-- son las dos que leen la cuenta corriente.
create index if not exists ventas_alumno_idx on public.ventas (alumno_id);
