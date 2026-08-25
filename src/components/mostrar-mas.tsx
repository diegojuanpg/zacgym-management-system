"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { useNavegacion } from "@/hooks/use-navegacion";
import { TANDA_FILAS } from "@/lib/recorte";

/**
 * "Mostrar 200 más" al pie de la tabla, ocupando el ancho entero.
 *
 * Es un link con los mismos parámetros más una tanda: se puede abrir en otra
 * pestaña y la posición sobrevive al refresh. Sin nada más para mostrar no se
 * dibuja.
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
  const { irA, local } = useNavegacion();

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
          render={
            <Link
              href={`${ruta}?${otros}`}
              // Con filtros locales las filas ya están en el navegador: la
              // tanda siguiente se dibuja sin pedir nada.
              onClick={
                local
                  ? (e) => {
                      e.preventDefault();
                      irA(otros);
                    }
                  : undefined
              }
            />
          }
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
