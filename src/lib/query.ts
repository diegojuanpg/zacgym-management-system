/**
 * Los `searchParams` de una página como query string.
 *
 * Next los entrega como objeto —y un filtro repetido llega como array—, y los
 * filtros locales arrancan de una `URLSearchParams`. Esto los pasa de uno al
 * otro sin perder los repetidos.
 */
export function comoQuery(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === undefined) continue;
    for (const uno of Array.isArray(valor) ? valor : [valor]) query.append(clave, uno);
  }
  return query.toString();
}
