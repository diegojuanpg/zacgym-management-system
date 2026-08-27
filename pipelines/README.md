# Pipelines

Lo que llena la base desde afuera. Nada de esto corre en la app: son Apps Script
con triggers de Google, mas un script suelto para el backfill historico.

Vienen de `zacgym-app/` y `zac-gym/`, donde estaban sueltos entre CSVs. **Esta
copia pasa a ser la fuente de verdad**: editar aca y pegar en el editor de Apps
Script, no al reves, o las dos versiones se separan y no hay forma de saber cual
esta corriendo.

## Que escribe cada uno

Las corridas quedan en la tabla `pipeline_logs`, con el nombre en la columna
`pipeline`. Sirve para ver si algo dejo de correr.

| pipeline | archivo | que hace |
|---|---|---|
| `syncCheckins` | `apps-script/Code.gs` | Baja los check-ins de la API de PulsoFlow a `check_ins`. |
| `syncMembers` | `apps-script/Code.gs` | Baja las membresias a `alumnos_pulsoflow`. |
| `rebuildTracking` | `apps-script/Code.gs` | Rearma `alumnos_tracking` con lo anterior. Es de donde salen el genero y la fecha de nacimiento que muestra `alumnos_cuenta` cuando la ficha no los tiene cargados. |
| `dias` | `apps-script/DiasEntrenamiento.gs` | Para cada alumno con actividad en los ultimos 14 dias, busca su planilla y anota los dias entrenados. |
| `rutinas` | `apps-script-control/RutinasPorAsistencia.gs` | Avanza las rutinas segun la asistencia de la semana. |

`apps-script/Dashboard.gs` no es un pipeline: arma la hoja "Dashboard" una sola
vez, con formulas que despues se recalculan solas.

`apps-script-control/` es el resto de la operatoria de rutinas, de corrida
manual: `AvanzarRutinas.gs` (adelanta un bloque a todos, se uso una vez para
ponerse al dia), `ListadoPlan.gs` (junta el plan de cada alumno desde la hoja
Pagos de su planilla) y `ShareRutinas.gs` (comparte y descomparte planillas en
masa).

`backfill/fetch_checkins.py` es aparte: baja el historico completo de check-ins
de la API de PulsoFlow a un CSV, con un token sacado del browser. Se corre a
mano cuando hace falta rearmar el historico, no periodicamente.

## Secretos

Ninguno de estos archivos tiene una credencial adentro, y no hay que ponersela.

- La `service_role` de Supabase va en Script Properties: se corre `setSecrets()`
  (o `setSecretsRutinas()`) una vez con el valor pegado, y despues se borra del
  codigo. Tiene que ser la key **legacy** (`eyJ...`): la `sb_secret_...` la
  bloquea Supabase desde Apps Script.
- El refresh token de PulsoFlow tambien vive en Script Properties.
- Lo unico que si esta en el codigo es la anon key de PulsoFlow
  (`sb_publishable_...`), que es publica por diseño.

## Esquema

Las tablas que estos pipelines escriben —`check_ins`, `alumnos_pulsoflow`,
`alumnos_tracking`, `pipeline_logs`— se declaran en `supabase/migrations/` de
este repo con `create table if not exists`, para no pisar las de produccion. Esa
carpeta manda: aca no hay copia del esquema a proposito, tener dos era la forma
segura de que se separaran.
