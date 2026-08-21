import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";

/** Cuántas filas dibuja una tabla por vez. */
export const TANDA_FILAS = 200;

/**
 * El recorte de una lista para lo que se pidió ver hasta ahora.
 *
 * Se recorta lo que se pinta, no lo que se cuenta: los totales, las solapas y
 * las opciones de los filtros siguen mirando la lista entera.
 */
export function recortar<T>(lista: T[], filas: string | string[] | undefined) {
  const tope = Math.max(TANDA_FILAS, Number(typeof filas === "string" ? filas : "") || 0);
  return { tope, visibles: lista.slice(0, tope) };
}

/**
 * "Mostrar 200 más" al pie de la tabla, ocupando el ancho entero.
 *
 * Es un link con los mismos parámetros más una tanda: no necesita JS, se puede
 * abrir en otra pestaña y la posición sobrevive al refresh. Sin nada más para
 * mostrar no se dibuja.
 */
export function MostrarMas({
  ruta,
  params,
  tope,
  enPagina,
  total,
  columnas,
}: {
  ruta: string;
  params: Record<string, string | string[] | undefined>;
  tope: number;
  enPagina: number;
  total: number;
  /** Cuántas columnas tiene la tabla, para que la fila ocupe el ancho entero. */
  columnas: number;
}) {
  if (total <= enPagina) return null;

  const otros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (clave === "filas" || valor === undefined) continue;
    for (const uno of Array.isArray(valor) ? valor : [valor]) otros.append(clave, uno);
  }
  otros.set("filas", String(tope + TANDA_FILAS));

  return (
    <TableRow className="!bg-transparent">
      <TableCell colSpan={columnas} className="!py-3 text-center">
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={`${ruta}?${otros}`} />}
        >
          Mostrar {Math.min(TANDA_FILAS, total - enPagina)} más
          <span className="text-[var(--ds-gray-900)]">
            {" "}
            · {enPagina} de {total}
          </span>
        </Button>
      </TableCell>
    </TableRow>
  );
}
