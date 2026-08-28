# Pipelines

Lo que llena la base desde afuera. Nada de esto corre en la app: son Apps Script
con triggers de Google, mas un script suelto para el backfill historico.

Vienen de `zacgym-app/` y `zac-gym/`, donde estaban sueltos entre CSVs. **Esta
copia pasa a ser la fuente de verdad**: editar aca y pegar en el editor de Apps
Script, no al reves, o las dos versiones se separan y no hay forma de saber cual
esta corriendo.

## Los pipelines

Todos viven en `apps-script/Pipelines.gs`, un solo archivo. Antes eran cuatro,
cada uno con su propio cliente de Supabase: quince funciones haciendo lo mismo y
la URL escrita en cinco lugares. Ahora hay un nucleo compartido —`supaGet_`,
`supaPatch_`, `supaUpsert_`, `supaRpc_`, `supaLog_`— y todos lo usan.

Las corridas quedan en `pipeline_logs`, con el nombre en la columna `pipeline`.

| # | pipeline | hora | frecuencia | que hace |
|---|---|---|---|---|
| 1 | `syncSheetIds` | 02:00 | diaria | Barre Drive buscando las rutinas y le pega el `sheet_id` a cada alumno. |
| 2 | `syncCheckins` | cada hora, 5 a 23 | 19x dia | Baja los check-ins de PulsoFlow a `check_ins`. |
| 3 | `syncMembers` | cada hora, 5 a 23 | 19x dia | Baja las membresias a `alumnos_pulsoflow`. |
| 4 | `dias` | 03:00 | diaria | Abre la planilla de cada alumno con actividad reciente y cuenta los dias programados. |
| 5 | `rebuildTracking` | cada hora, 5 a 23 | 19x dia | Rearma `alumnos_tracking` con lo de arriba. |
| 6 | `semanaRutina` | 5:30, 8:30, 12:30, 17:30 | 4x dia | Lee de cada planilla la semana abierta -> columna Semana del listado. |
| — | `rutinas` | lunes | semanal | Avanza el bloque segun la asistencia. Sigue en `apps-script-control/`. |

Los 2, 3 y 5 son un solo trigger (`runHorario`), que se corta fuera del horario
del gimnasio en vez de tener diecinueve triggers: Apps Script permite 20 por
script y no entrarian.

`dias` va antes que `rebuildTracking` y no es opcional: rebuild hace un
`left join` contra `dias_entrenamiento` y copia de ahi los dias **y el
sheet_id**. Corriendo a las 3, el rebuild de las 4 lo levanta.

Fuera de `runHorario` porque tarda minutos y no tiene por que frenar al resto
diecinueve veces por dia.

## Puesta en marcha

1. Pegar `Pipelines.gs` en el proyecto de Apps Script.
2. Servicios (+) > **Google Sheets API**. Habilita la API y el permiso que
   necesita `semanaRutina`.
3. Configuracion del proyecto > Zona horaria > **America/Argentina/Buenos_Aires**.
   Los triggers usan el huso del proyecto, no el de la cuenta.
4. `setSecrets` con la legacy `service_role`, y borrar el valor del codigo.
5. `chequeo` — verifica secret, lectura, sesion de PulsoFlow, Drive y Sheets sin
   escribir nada.
6. `instalarTodo`, y `verTriggers` para confirmar.

## De donde saca el sheet_id

Antes de `sheetIds`, el `sheet_id` vivia en una columna de la planilla "Control
de usuarios", mantenida a mano. Cuatro scripts dependian de ella y un alumno que
faltara ahi quedaba invisible para todos sin que nada fallara: en los logs quedan
los `sin sheet_id en Control de usuarios`.

Ahora la fuente es `alumnos.sheet_id`, que ya existia en el esquema y esta
poblada. `sheetIds` la mantiene al dia: busca en Drive los archivos que terminan
en " - Rutina" —salteando la carpeta "Usuarios archivados"— y busca de quien es.
Primero por el nombre del archivo contra apellido y nombre, en los dos ordenes,
probando con los parentesis y despues sin ellos —hay tres alumnos cuyo nombre
ES el parentesis, "Guillermo (Hijo)", "Hernan (Padre)" y "Mariano (grande)",
cada uno con un homonimo sin el, asi que sacarlos de entrada funde a padre e
hijo en una sola persona—.
Si no engancha, mira con que mails esta compartido el archivo, que cuesta una
llamada mas a Drive y por eso solo se paga cuando el nombre fallo.

## Como jubilar una rutina vieja

Lo mejor sigue siendo **moverla a "Usuarios archivados"**: el barrido saltea esa
carpeta entera y no hay nada que recordar.

Si se prefiere renombrar, alcanza con que el nombre diga **archivado** (o
"no usar", "descartar", "obsoleta"). Esas palabras sacan al archivo del barrido
aunque siga diciendo "Rutina".

Lo que **no** alcanza es cualquier otro agregado: "Fulano - Rutina (Vieja)",
"- Rutina 2024" o "- Rutina anterior" siguen resolviendo al mismo alumno,
porque todo lo que viene despues de "rutina" se corta. El script ve dos rutinas,
se niega a elegir y el alumno se queda con el id viejo.

Dos reglas que conviene tener presentes:

- **Drive le gana a la base.** Si el alumno ya tenia otro `sheet_id` y aparece
  un archivo con su nombre, se pisa. Queda el warn con el valor anterior.
- **Entre dos archivos de Drive no gana ninguno.** Dos rutinas para el mismo
  alumno son duplicados en Drive, y elegir una al azar es peor que no tocar
  nada: se avisa y se deja lo que estaba. Para poder decidir eso hay que
  conocer todos los archivos de un alumno antes de escribir, asi que el barrido
  va en dos fases: primero releva Drive entero, despues escribe. Si el relevo no
  termina, no escribe nada: un mapa a medias no sirve para decidir.
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
- 

## Ordenar Drive

`apps-script/InventarioDrive.gs` no es un pipeline: no toca nada y se corre a
mano cuando hay que limpiar. `inventarioDrive()` vuelca los archivos a una
planilla nueva con lo que hace falta para decidir cual queda y cual se archiva:
que alumno se le detecta, si ese alumno esta en la base, que palabras
sospechosas trae el nombre —vieja, copia, prueba, un año— y **cuantos archivos
comparten el mismo alumno**. Los repetidos quedan arriba y con sus filas
pegadas.

Esto es lo que resuelve los duplicados que `sheetIds` reporta y no puede tocar.
Un `"Fulano - Rutina (Vieja)"` conviviendo con el bueno deja a Fulano sin
`sheet_id` para siempre, porque los dos nombres resuelven al mismo alumno y el
script prefiere no elegir. Se arregla moviendo la vieja a "Usuarios
archivados", que es la carpeta que el barrido saltea.

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

## La semana abierta de cada alumno

`semanaRutina` mira la misma hoja que el script de rutinas —`Entrenamiento` con
el numero mas alto— y saca la fecha del bloque visible: el primer `SERIES` cuya
columna no este oculta, con la fecha tres filas mas arriba.

No es lo mismo que `alumnos_tracking.ultima_rutina_semana`, que es la semana que
el pipeline de rutinas **fijo** al avanzar. Esta es la que la planilla tiene
abierta **de verdad**, y tenerlas separadas es lo que deja ver cuando se
separaron.

Solo mira a los que entrenaron en el ultimo mes o tienen la cuota al dia —hoy
unos 300 de 1912—: el que no entrena hace rato no cambia de semana y leerle el
archivo todos los dias gasta cuota de Google al pedo.

Dos bloques visibles a la vez no se resuelven eligiendo uno: la planilla quedo a
medio actualizar y cualquiera de los dos puede ser el equivocado. Guarda
**"Revisar"** y la columna del listado lo muestra en ambar, linkeado a la
planilla para ir a mirarla.

No abre las planillas con `SpreadsheetApp`, que cuesta segundos por archivo:
usa la API de Sheets pidiendo solo tres rangos, de a diez en paralelo.

**Antes de correrlo por primera vez**, `probarUnAlumno()` con un apellido
cargado a mano dice que hoja eligio, en que fila encontro `DIA`, que columnas vio
visibles y que fecha saco, sin guardar nada.
