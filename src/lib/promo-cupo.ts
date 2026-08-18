/**
 * Para cuánta gente es una promo, leído de su nombre: "Promo Fliar x3" → 3.
 *
 * Vive en su propio módulo, sin directiva, porque lo usan las dos orillas: la
 * página de promos (server) y el modal (client). Exportado desde un archivo
 * "use client" sería una referencia de cliente y el server no podría llamarlo.
 *
 * Se lee del nombre y no de una columna aparte: es un dato que ya está escrito
 * y que nadie va a mantener dos veces. Si el nombre no lo dice, devuelve null
 * y no se avisa nada.
 */
export function cupoDe(nombre: string): number | null {
  const m = nombre.match(/x\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}
