# Sistema actual de pagos ZacGym — analisis

Relevado el 11/08/2026 desde los dos spreadsheets en produccion y sus Apps Script.
Fuentes crudas guardadas en `docs/legacy/` (codigo tal cual esta hoy en Google).

| Pieza | ID | Rol |
| --- | --- | --- |
| **Novedades** (sheet) | `1shiI7g6oMaAggTpwMOWCyJNY6Bs6KqKsMOLW_ZdA-EQ` | La "app" del mostrador. Donde el staff carga todo. |
| **Hoja Madre** (sheet) | `1AJ7rleF-zHcBpKnV5UPbQe04ZABQOw3Kk8UOuxy9ryg` | Base de datos. Alumnos, ventas historicas, settings. |
| Script de Novedades | `1GG04NGnmchylv3CSRHsjQMOqv7RDkKad8WJyj83vXK6UYg4TIHZeQRk_` | 1.398 lineas, 42 funciones. |
| Script de Hoja Madre | `1FqK9fQ3tGmARVXxzGz8DPaO3Qkz3PWgdURmJv5CeuA5QuW6aKWaPEEyN` | 11 archivos, ~2.000 lineas. |
| Planilla por alumno | 1 spreadsheet por alumno (ID en `Control de usuarios!A`) | Hoja `Pagos` = estado de cuenta individual. |
| Supabase existente | `lrjqasglgmcxntuwamow.supabase.co` | Ya recibe check-ins y socios desde PulsoFlow. |

---

## 1. La hoja Novedades es una UI, no una tabla

Una sola hoja con zonas fijas. El staff escribe en celdas concretas y un trigger
`onEdit` (`handleEdit`) dispara la accion segun **que celda** se edito y **que texto**
se escribio. Las "celdas boton" son el patron central:

| Celda | Texto disparador | Funcion | Que hace |
| --- | --- | --- | --- |
| `F18` | `añadir` | `anadirAlumno()` | Alta de alumno |
| `F22` | `revise` | `controlDeCaja()` | Sella fecha/hora del arqueo |
| `M22` | `ingresar` | `ingresarVentas()` | Pasa el formulario de ventas al log del dia |
| `F32` | `revise` | `controlDeStock()` | Fecha las lineas de conteo de stock |
| `R22` | `ingresar` | `crearTarea()` | Crea tarea en Hoja Madre |
| `M32` | `transferir datos` | `transferirVentasDB()` | Cierra turno + manda todo a Hoja Madre |
| `D34:D…` | (cualquier valor) | inline | Escribe timestamp en `C` de esa fila |

Zonas de la hoja:

- **`B8:E15` — totales del dia.** Efectivo vs Transferencia, separando *mensualidades/suplementos*
  de *consumibles*, con `FILTER` sobre el log del dia cruzado contra `Lista de precios`.
- **`B18:D20` — alta de alumno.** Apellido en `B20`, Nombre en `D20`.
- **`B22:F27` — control de caja.** Caja grande / caja chica, mas `ULTIMO CIERRE`
  (`MAX` de `Controles de caja`) para comparar contra lo contado.
- **`H22:M30` — formulario de ventas (6 filas, `I24:M29`).** Alumno, producto, cantidad,
  metodo, total. `H` calcula la promo familiar sola; `M` calcula el precio solo.
- **`H32:M…` — log de ventas del dia** (se llena al apretar INGRESAR VENTAS, se vacia al transferir).
- **`B32:F…` — conteo fisico de stock** contra el stock del sistema, con diff (`✅ OK`, `📉 Falta N`).
- **`O22:Q…` — tareas** y **`O32:O…` — anotaciones libres** (deudas informales, vueltos, etc).

**Automatismos por formula** (se reescriben solas en cada `onOpen` via
`restaurarFormulasAlAbrir()`, porque el staff las rompe seguido):

- **Precio automatico**: `VLOOKUP` del producto contra `Menu desplegables!I:J` × cantidad.
- **Promo familiar automatica**: busca al alumno en `Promos` de Hoja Madre por `IMPORTRANGE`.
  Primero mira promos especiales (`Promos!M:N`); si no, cuenta cuantos integrantes tiene su
  familia y devuelve `Promo Fliar x3/x4/x5`, o `SIN PROMOCIÓN` si son menos de 3.
- **Diferencia de stock**: conteo manual − stock del sistema.

---

## 2. Flujo de un pago, de punta a punta

```
[mostrador] escribe venta en I24:M29  ->  "ingresar" en M22
        -> ingresarVentas(): valida, timestamp, apila en el log del dia (H34:M…)
[cierre de turno] "transferir datos" en M32
        -> transferirVentasDB():
             1. pide DNI -> cierra turno en "Control de horarios" (calcula horas, redondeo 0.5)
             2. arqueo de caja -> fila nueva en "Controles de caja"
             3. descuenta stock vendido de "Lista de precios"
             4. escribe las ventas en Hoja Madre -> hoja "Novedades" (append)
             5. los pagos de deuda (metodo "* DEUDA") NO se appendean:
                buscan la deuda vieja y la cancelan o la dejan como pago parcial
             6. limpia el log del dia
[Hoja Madre] "Actualizacion general" (manual, menu)
        -> actualizacionGeneralClientes(), por cada alumno activo:
             marcarDeudas()            -> marca "DEBE" los meses vencidos impagos
             procesarPagos()           -> aplica las ventas nuevas a la hoja Pagos del alumno
             crearYVerificarVencimientos() -> si el ultimo mes quedo pago, crea el mes siguiente
             extraerInfoPagos()        -> resume plan / fecha de pago / deudas
        -> escribe el resumen en "Control de usuarios" (columnas Plan, Fecha de inicio,
           Fecha de pago, Deudas)
```

### Reglas de negocio que hay que preservar

**Metodos de pago**: `Efectivo`, `Transferencia`, `DEBE`, `Efectivo DEUDA`, `Transferencia DEUDA`.
Los dos ultimos no son ventas: son **cobros contra una deuda ya registrada**.

**Deuda parcial**: si el cobro no alcanza a cubrir la deuda, no se cancela nada — se acumula
una nota `PAGO PARCIAL: <monto>, <metodo>` en la columna `Pagos parciales`, separadas por `-`.
Cuando la suma de parciales alcanza el total, recien ahi la fila pasa a `Efectivo`/`Transferencia`
y se limpia la nota. (`_sumarPagosParciales` + el bloque de deudas de `transferirVentasDB`).

**Validacion de cobro de deuda**: al ingresar un `* DEUDA` se exige que exista en Hoja Madre una
fila con **mismo nombre, mismo producto, misma cantidad, mismo total y metodo `DEBE`**. Si no
existe, el cobro se rechaza con aviso. Al transferir, el match es mas laxo (no compara total) y
si hay varias deudas iguales se cancela **la mas vieja**.

**Que cuenta como mensualidad**: solo los productos listados en `Settings` con
`¿EL SCRIPT DEBE CARGAR ESTE TIPO DE MENSUALIDAD? = SI`. Cada uno define:
- `PRECIO INDIVIDUAL` — lo que se escribe en la hoja del alumno por mes
- `¿POR CUANTOS MESES EQUIVALE?` — 1 para Cuota/Promos, 3 Bronce, 6 Plata, 12 Oro
- `TEXTO A MOSTRAR` — etiqueta en el estado de cuenta

Hoy: `Cuota` $50.000 (1 mes), `Promo Fliar x3` $45.000, `x4` $43.750, `x5` $42.500 (1 mes c/u),
`Pase Bronce` $135.000 (3), `Pase Plata` $237.500 (6), `Pase Oro` $464.500 (12).
Todo lo demas (agua, suplementos, barritas) es consumible: mueve stock y caja, no toca vencimientos.

**Imputacion del pago** (`encontrarPuntoDePartida`): busca de abajo hacia arriba el ultimo mes
cuya fecha de inicio ya paso y que no este pago; si no hay, el primer mes impago. Ahi arranca a
imputar `mesesACargar = cantidad × mesesEquivale`. Multi-mes (pases) se escribe como **celdas
combinadas** que abarcan los N meses. Si faltan filas de meses, las crea sumando 1 mes a la ultima.

**Vencimiento**: no hay campo "vence". El vencimiento es la **fila siguiente** de la hoja `Pagos`
del alumno: fecha de inicio del mes que viene = `_addMonths(fecha_inicio_base, meses_cubiertos)`.
Se crea sola cuando el ultimo mes con fecha quedo pago.

**DEBE automatico**: cualquier mes cuya fecha de inicio ya paso y no tiene pago se marca `DEBE`.
El contador de `DEBE` de la hoja del alumno es la columna `Deudas` en `Control de usuarios`.

**Alta de alumno**: `Apellido, Nombre` en Proper Case, normalizado (sin acentos, lower) para
detectar duplicados contra `Control de usuarios!B`. Se appendea **sin ID** — el ID (spreadsheet
propio del alumno) lo crea despues otro flujo (`CrearArchivo` / `procesarCreacionArchivo`).

**Turnos**: `iniciarTurno()` pide DNI y sella hora de inicio en la columna del empleado dentro de
`Control de horarios`; el cierre ocurre dentro de `transferirVentasDB()` y calcula horas
redondeadas a la media hora mas cercana.

---

## 3. Modelo de datos real (lo que la app tiene que representar)

**Hoja Madre** (destino):

| Hoja | Contenido |
| --- | --- |
| `Control de usuarios` | 206 alumnos activos. ID (spreadsheet), Nombre, Estado, Ultima actividad, Dias inactivo, Plan, Familia, Promo, Fecha inicio, Fecha de pago, Deudas, $ Mensualidad, + columnas de rutinas |
| `Novedades` | **Libro de ventas historico**: Fecha y hora, Nombre, Producto, Cantidad, Metodo, Total, Estado (`Cargado`), Pagos parciales, Notas |
| `Promos` | Familia + hasta 10 integrantes; `Especiales` (alumno -> promo puntual) |
| `Settings` | Catalogo de mensualidades (precio, meses, texto, si el script la carga) |
| `Lista de tareas` | Tareas del staff |
| `Listado de vencidos` | Vencidos + DEBE + seguimiento |
| `Transferencias` | Registro aparte de transferencias |
| `Check-ins` | Ingesta desde PulsoFlow |

**Novedades** (origen):

| Hoja | Contenido |
| --- | --- |
| `Novedades` | La UI descrita arriba |
| `Lista de precios` | 4 tablas de productos con precio y stock (mensualidades B/C, consumibles E/F/G, suplementos I/J/K, combinados N..X/S/U) |
| `Menu desplegables` | Vistas planas de las 4 tablas, para los dropdowns y los VLOOKUP |
| `Controles de caja` | Historico de arqueos (caja grande / caja chica) |
| `Control de horarios` | Turnos por empleado + padron Nombre/DNI |

---

## 4. Problemas del sistema actual (lo que la app deberia arreglar)

1. **Match de deudas por 4 strings.** Nombre + producto + cantidad + total. Si cambia el precio o
   hay un typo, la deuda no se encuentra. No hay ID de deuda.
2. **La identidad del alumno es el string `Apellido, Nombre`.** Todo el sistema cruza por ese texto
   (`IMPORTRANGE`, `VLOOKUP`, promos, pagos). Un acento o un espacio rompe la cadena.
3. **Formulas que se rompen** — tanto, que hay una funcion que las reescribe todas en cada apertura.
4. **Sin control de concurrencia.** Dos personas en el mostrador al mismo tiempo pisan las mismas
   celdas del formulario.
5. **Sin auditoria.** No queda quien cargo cada venta (solo quien cerro el turno, por DNI).
6. **El estado de cuenta vive en 206 spreadsheets separados**, uno por alumno, recorridos de a uno
   con reanudacion por trigger porque no entra en los 6 minutos de Apps Script.
7. **La caja no cierra sola.** El arqueo es un numero tipeado; nadie valida contra lo vendido.
8. **DEUDA vs deuda de mensualidad son dos cosas distintas** con el mismo nombre: el `DEBE` del
   libro de ventas y el `DEBE` de un mes impago en la hoja del alumno.

---

## 5. Que tiene que hacer la app (alcance funcional heredado)

Minimo para reemplazar Novedades:

- [ ] Cargar ventas (alumno, producto, cantidad, metodo, total auto, promo auto)
- [ ] Cobro de deudas con pagos parciales
- [ ] Log del dia + confirmacion antes de cerrar
- [ ] Totales del dia partidos por metodo y por tipo de producto
- [ ] Arqueo de caja (grande/chica) con historico y ultimo cierre
- [ ] Stock: descuento por venta, conteo fisico con diferencia, reposicion
- [ ] Alta de alumno con deteccion de duplicados
- [ ] Tareas y anotaciones
- [ ] Turnos: inicio/cierre por DNI con calculo de horas
- [ ] Imputacion de pagos a meses, promos multi-mes, vencimientos, marcado de DEBE
- [ ] Catalogo de precios y mensualidades editable
