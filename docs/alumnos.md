# Alumnos

El listado de alumnos no se carga a mano: se arma cruzando lo que baja de
PulsoFlow con lo que hay en Google Drive y con lo que se carga en el mostrador.

![Listado de alumnos](media/alumnos.png)

En una sola fila se ve lo que antes estaba repartido en tres lugares: cuántos
días entrena, en qué semana de rutina está, cuándo vino por última vez, cuándo le
vence la cuota y cuánto debe.

Los filtros de arriba son las preguntas que se hacen todos los días: quién vence
esta semana, quién venció la semana pasada, a quién hay que notificar, qué
rutinas hay que revisar.

## De dónde sale cada cosa

| Dato | Origen |
|---|---|
| Nombre, mail, teléfono, plan, vencimiento, estado | Membresías de PulsoFlow, cada hora. |
| Última actividad | Check-ins de PulsoFlow, cada hora. |
| Días que entrena | Se cuentan en la planilla de rutina de cada alumno, una vez por día. |
| Semana de rutina | Se lee de la planilla cuatro veces por día. |
| Balance (debe / a favor) | Ventas y pagos cargados en el mostrador. |

El cruce lo rearma `rebuildTracking` cada hora, después de que bajaron las dos
fuentes.

## Cómo encuentra la planilla de cada alumno

Un barrido diario de Drive busca los archivos que terminan en `" - Rutina"` y
resuelve de quién es cada uno: primero por el nombre del archivo contra apellido
y nombre, en los dos órdenes; si no engancha, mirando con qué mails está
compartido el archivo (que cuesta una llamada más, y por eso solo se paga cuando
el nombre falló).

Antes de esto, el vínculo entre alumno y planilla vivía en una columna de una
planilla "Control de usuarios" que se mantenía a mano, y de la que dependían
cuatro scripts. El alumno que faltara ahí quedaba invisible para todos **sin que
nada fallara**: de 49 alumnos activos que figuraban sin días de entrenamiento, 48
simplemente no tenían fila en esa planilla.

El barrido tiene dos reglas que lo hacen seguro de dejar corriendo solo:

- **Entre dos archivos del mismo alumno no gana ninguno.** Dos rutinas para la
  misma persona son un duplicado en Drive, y elegir una al azar es peor que no
  tocar nada: avisa y deja lo que estaba. Para poder decidir eso necesita conocer
  todos los archivos antes de escribir, así que el barrido va en dos fases:
  primero releva Drive entero, después escribe. Si el relevo no termina, no
  escribe nada.
- **No crea alumnos.** Un archivo que no engancha con nadie deja un aviso y nada
  más. La versión vieja agregaba filas sola, y por eso después había que borrar
  duplicados.

## La ficha

![Ficha de un alumno](media/ficha-alumno.gif)

La ficha junta los datos del alumno, su vencimiento, su balance, sus tareas
pendientes y todo lo que compró y pagó, con la deuda por venta.

Esto es lo que ordenó la cobranza. Antes había gente debiendo dos meses de
gimnasio y viniendo igual, y el que cobraba no se daba cuenta por el lío que era
manejar los pagos: el 40% de los alumnos activos debía algo. Hoy ronda el 7% y
nadie debe más de dos semanas.

El mismo dato se ve donde hace falta usarlo: al cargarle una venta a alguien que
debe, el mostrador lo avisa en el momento.

![Aviso de deuda al cargar una venta](media/venta-deuda.png)
