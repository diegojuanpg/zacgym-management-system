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
