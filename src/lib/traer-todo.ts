/** Lo que PostgREST devuelve como maximo por pedido, de supabase/config.toml. */
const TOPE = 5000;

/**
 * Trae la consulta entera, en tandas.
 *
 * PostgREST corta en `max_rows` y no avisa: la respuesta llega igual, con menos
 * filas y sin ningun error. Con 5612 ventas eso eran 612 que no aparecian en
 * ningun lado. Las tandas van pegadas al tope real y no mas abajo, porque cada
 * una es un viaje mas y van uno atras del otro.
 */
export async function traerTodo<T>(consulta: {
  range: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}) {
  const filas: T[] = [];
  for (let desde = 0; ; desde += TOPE) {
    const { data, error } = await consulta.range(desde, desde + TOPE - 1);
    // Una consulta rechazada volvia con data en null y se leia igual que "no hay
    // nada": pedirle a la vista una columna que todavia no estaba en la base
    // dejaba la tabla de Tareas vacia, sin un solo error a la vista. Una lista
    // vacia es una respuesta, y equivocarla es peor que romper.
    if (error) throw new Error(`No se pudo traer la consulta: ${error.message}`);
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < TOPE) break;
  }
  return filas;
}
