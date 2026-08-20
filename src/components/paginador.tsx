import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Anterior / Siguiente con la cuenta al lado.
 *
 * Los links se arman con los parametros que ya estan puestos: cambiar de pagina
 * no puede perder el filtro ni la busqueda. Y son links de verdad, asi que
 * andan sin JS y se pueden abrir en otra pestaña.
 */
export function Paginador({
  ruta,
  params,
  actual,
  paginas,
  desde,
  enPagina,
  total,
}: {
  ruta: string;
  params: Record<string, string | string[] | undefined>;
  actual: number;
  paginas: number;
  /** Indice de la primera fila de la pagina, para el "31–60 de 200". */
  desde: number;
  enPagina: number;
  total: number;
}) {
  if (paginas <= 1) return null;

  const href = (n: number) => {
    const otros = new URLSearchParams();
    for (const [clave, valor] of Object.entries(params)) {
      if (clave === "pagina" || valor === undefined) continue;
      for (const uno of Array.isArray(valor) ? valor : [valor]) otros.append(clave, uno);
    }
    if (n > 1) otros.set("pagina", String(n));
    const cadena = otros.toString();
    return cadena ? `${ruta}?${cadena}` : ruta;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ds-gray-alpha-400)] px-1 pt-3">
      <p className="text-copy-13 m-0 text-[var(--ds-gray-900)]">
        {desde + 1}–{desde + enPagina} de {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={actual === 1}
          nativeButton={false}
          render={<Link href={href(actual - 1)} />}
        >
          Anterior
        </Button>
        <span className="text-copy-13 text-[var(--ds-gray-900)]">
          {actual} / {paginas}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={actual === paginas}
          nativeButton={false}
          render={<Link href={href(actual + 1)} />}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

/** El recorte de una lista para la pagina que se pide. */
export function paginar<T>(lista: T[], pagina: string | string[] | undefined, porPagina: number) {
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  // Se recorta contra el total: cambiar de solapa desde la pagina 15 cae en la
  // ultima que exista en vez de mostrar una tabla vacia.
  const actual = Math.min(Math.max(1, Number(pagina) || 1), paginas);
  const desde = (actual - 1) * porPagina;
  return { actual, paginas, desde, visibles: lista.slice(desde, desde + porPagina) };
}
