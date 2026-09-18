# Demo local

Las capturas y los GIFs de esta documentación salen de una demo que se levanta en
cualquier máquina con Docker, con **datos inventados**: ningún alumno, empleado,
importe o teléfono de las imágenes corresponde a una persona real. Los mails son
`@example.com` y los teléfonos caen en el rango `555-01xx`, que no existe.

## Levantarla

```bash
pnpm install
pnpm db:start     # Supabase en Docker
pnpm db:reset     # migraciones + catálogo de productos
docker exec -i supabase_db_zacgym-management-system \
  psql -U postgres -d postgres < supabase/demo/seed-demo.sql
pnpm dev
```

Entrar con **`demo@zacgym.test` / `demo-zacgym-2026`**.

Si el puerto 3000 está ocupado, Next arranca en el 3001 y lo dice al iniciar.

## Qué genera el seed

| | |
|---|---|
| 32 alumnos | Con vencimientos escalonados: la mayoría al día, algunos vencidos. |
| ~900 check-ins | Ocho semanas de asistencias, respetando los días asignados a cada uno. |
| 7 turnos | Seis cerrados y uno abierto, que es el que muestra el mostrador. |
| ~70 ventas con sus pagos | Una de cada seis queda fiada, que es la deuda que se ve en la ficha. |
| Diferencias de caja y stock | Algunos cierres no cuadran a propósito. |
| Corridas de los 7 pipelines | Para que la pantalla de Pipelines muestre estado real. |

El seed es [`supabase/demo/seed-demo.sql`](../supabase/demo/seed-demo.sql) y se
puede volver a correr después de un `pnpm db:reset`.

Lo que **no** trae la demo es la mitad de afuera: los pipelines de Apps Script
hablan con PulsoFlow y con Google Drive, así que los datos que en producción
bajan solos acá vienen sembrados. Todo lo demás —mostrador, alumnos, turnos,
caja, stock, tareas— funciona igual que en producción.

## Cómo se rehacen las imágenes

Las capturas se toman a 1440×900 sobre esta misma demo y se bajan a 960 px de
ancho; los GIFs se arman encadenando un cuadro por paso. Para rehacer una, hay
que levantar la demo, llegar a la pantalla y capturar de nuevo: los cuadros
crudos no se versionan.
