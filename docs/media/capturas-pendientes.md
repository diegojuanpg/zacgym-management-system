# Capturas pendientes: PulsoFlow y Apps Script

Todo lo que se ve en la documentación sale de la demo local, que no tiene acceso
ni a PulsoFlow ni a Google. Estas cuatro capturas son las que faltan para
mostrar el lado de afuera, y hay que sacarlas desde una sesión real.

**Antes de sacarlas:** que no entre en la foto ningún dato de un alumno real
(nombre, mail, teléfono). Lo que interesa mostrar es el mecanismo, no el padrón.

| # | Qué capturar | Dónde | Va en |
|---|---|---|---|
| 1 | El panel de PulsoFlow con la lista de check-ins del día, recortado a las columnas de fecha/hora. | PulsoFlow, pantalla de check-ins. | `extraccion-pulsoflow.md`, al principio: es el dato que estaba encerrado. |
| 2 | Una request a `api.pulsoflow.app` en la pestaña Network de DevTools: la URL con sus parámetros y un pedazo de la respuesta JSON. **Sin el header `authorization` a la vista.** | PulsoFlow abierto + DevTools. | `extraccion-pulsoflow.md`, sección "Entender cómo habla la app con su servidor". |
| 3 | La lista de triggers del proyecto de Apps Script, donde se ven los 7 con su frecuencia. | Apps Script → Activadores. | `extraccion-pulsoflow.md`, sección "Cómo se ve corriendo". |
| 4 | El log de una ejecución de `syncCheckins` terminada, con el "Check-ins procesados: N". | Apps Script → Ejecuciones. | `extraccion-pulsoflow.md`, sección "Cómo se ve corriendo". |

Guardarlas en `docs/media/` como `pulsoflow-checkins.png`,
`pulsoflow-network.png`, `apps-script-triggers.png` y `apps-script-log.png`, y
reemplazar el comentario `<!-- PENDIENTE ... -->` del final de
`extraccion-pulsoflow.md` por las imágenes.
