/**
 * Los filtros de encabezado que no son checkboxes: un rango "a..b" y una
 * comparación de montos. Viven en la URL, así que lo que llega es texto suelto
 * y puede venir de cualquier lado: todo lo raro cae en "sin filtro".
 */

/** "a..b": cualquiera de los dos lados puede venir vacío. */
export function rangoDe(v: string | string[] | undefined) {
  const [desde = "", hasta = ""] = (typeof v === "string" ? v : "").split("..");
  return { desde, hasta };
}

/**
 * El filtro de montos, como función: "mayor:5000", "entre:1000:5000".
 * null cuando no hay filtro, así la fila pasa sin comparar nada.
 */
export function comparador(v: string | string[] | undefined) {
  const [op, a = "", b = ""] = (typeof v === "string" ? v : "").split(":");
  const x = Number(a);
  const y = Number(b);
  if (a === "" || !Number.isFinite(x)) return null;
  if (op === "mayor") return (n: number | null) => n !== null && n > x;
  if (op === "menor") return (n: number | null) => n !== null && n < x;
  if (op === "igual") return (n: number | null) => n === x;
  if (op === "entre" && b !== "" && Number.isFinite(y)) {
    return (n: number | null) => n !== null && n >= x && n <= y;
  }
  return null;
}

/**
 * El lunes de la semana pasada, en "YYYY-MM-DD", a partir de la fecha de hoy.
 *
 * Es el mojón de las dos ventanas del listado de Alumnos, y por eso vive en un
 * solo lado: de ahí para acá el alumno "está viniendo", y de ahí para atrás su
 * vencimiento ya lleva dos semanas. La semana va de lunes a domingo.
 *
 * La cuenta se hace a mediodía UTC: la fecha ya viene resuelta en hora
 * Argentina y a esa hora ningún cambio de huso la corre de día.
 */
export function lunesPasado(hoy: string) {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
  return d.toISOString().slice(0, 10);
}
