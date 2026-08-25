/** Cuántas filas dibuja una tabla por vez. */
export const TANDA_FILAS = 200;

/**
 * El recorte de una lista para lo que se pidió ver hasta ahora.
 *
 * Se recorta lo que se pinta, no lo que se cuenta: los totales, las solapas y
 * las opciones de los filtros siguen mirando la lista entera.
 *
 * Vive acá y no con `MostrarMas` porque el botón es un componente de cliente y
 * esto lo llaman también las páginas que arman la tabla en el server.
 */
export function recortar<T>(lista: T[], filas: string | string[] | undefined) {
  const tope = Math.max(TANDA_FILAS, Number(typeof filas === "string" ? filas : "") || 0);
  return { tope, visibles: lista.slice(0, tope) };
}
