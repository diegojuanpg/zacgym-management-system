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
| `sheetIds` | `apps-script/SheetIds.gs` | Barre Drive buscando las rutinas y le pega el `sheet_id` a cada alumno en `alumnos`. Es el paso 0: de aca sacan el id todos los que abren la planilla de un alumno. Trigger propio a las 02:00, una hora antes que el resto. |
| `syncCheckins` | `apps-script/Code.gs` | Baja los check-ins de la API de PulsoFlow a `check_ins`. |
| `syncMembers` | `apps-script/Code.gs` | Baja las membresias a `alumnos_pulsoflow`. |
| `rebuildTracking` | `apps-script/Code.gs` | Rearma `alumnos_tracking` con lo anterior. Es de donde salen el genero y la fecha de nacimiento que muestra `alumnos_cuenta` cuando la ficha no los tiene cargados. |
| `dias` | `apps-script/DiasEntrenamiento.gs` | Para cada alumno con actividad en los ultimos 14 dias, busca su planilla y anota los dias entrenados. |
| `rutinas` | `apps-script-control/RutinasPorAsistencia.gs` | Avanza las rutinas segun la asistencia de la semana. |

## De donde saca el sheet_id

Antes de `sheetIds`, el `sheet_id` vivia en una columna de la planilla "Control
de usuarios", mantenida a mano. Cuatro scripts dependian de ella y un alumno que
faltara ahi quedaba invisible para todos sin que nada fallara: en los logs quedan
los `sin sheet_id en Control de usuarios`.

Ahora la fuente es `alumnos.sheet_id`, que ya existia en el esquema y esta
poblada. `sheetIds` la mantiene al dia: busca en Drive los archivos que terminan
en " - Rutina" —salteando la carpeta "Usuarios archivados"— y busca de quien es.
Primero por el nombre del archivo contra apellido y nombre, en los dos ordenes.
Si no engancha, mira con que mails esta compartido el archivo, que cuesta una
llamada mas a Drive y por eso solo se paga cuando el nombre fallo.

Dos reglas que conviene tener presentes:

- **Drive le gana a la base.** Si el alumno ya tenia otro `sheet_id` y aparece
  un archivo con su nombre, se pisa. Queda el warn con el valor anterior.
- **Entre dos archivos de Drive no gana ninguno.** Dos rutinas para el mismo
  alumno son duplicados en Drive, y elegir una al azar es peor que no tocar
  nada: se avisa y se deja lo que estaba. Sin esto el resultado dependia del
  orden en que Drive devolviera los archivos y cambiaba de corrida en corrida.
- **No crea alumnos.** Un archivo que no engancha con nadie solo deja un warn.
  La version vieja agregaba filas sola, y por eso despues tenia que borrar
  duplicados.

`SheetIds.gs` es autonomo: trae sus propios helpers de Supabase, con nombres
prefijados para no chocar con los de `Code.gs`. Va en el proyecto del pipeline o
en uno nuevo, da igual. Si comparte proyecto con `Code.gs` reusa la secret que
ese ya tiene; si esta solo, se corre `setSecretsSheetIds` una vez.

Antes de habilitar la escritura conviene un ensayo:

- `medirSheetIds()` barre todo Drive sin tocar la base y dice cuanto tarda, con
  cuantos archivos engancha por nombre y con cuantos por mail, y cuantos ids
  pondria y cuantos **pisaria**. Acumula entre pasadas, porque 1900 archivos no
  entran en los 6 minutos de Apps Script. `reiniciarMedicion()` la vuelve a cero.
- `previewSheetIds()` es la version corta, de una sola pasada.

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
