"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu } from "@/components/ui/menu";
import { ChevronDownIcon } from "@/components/icons";

export interface OpcionFiltro {
  label: string;
  /** Parámetro de la URL que setea esta opción. */
  param: string;
  value: string;
  section?: string;
}

/**
 * Encabezado de columna que abre un menú y escribe el filtro en la URL. Filtrar
 * del lado del server mantiene el estado compartible y sobrevive al refresh.
 */
export function FiltroColumna({
  etiqueta,
  opciones,
  /** Todos los parámetros que maneja esta columna: se limpian al elegir otro. */
  params: propios,
}: {
  etiqueta: string;
  opciones: OpcionFiltro[];
  params: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activa = opciones.find((o) => searchParams.get(o.param) === o.value);

  function aplicar(opcion: OpcionFiltro | null) {
    const nuevos = new URLSearchParams(searchParams.toString());
    propios.forEach((p) => nuevos.delete(p));
    if (opcion) nuevos.set(opcion.param, opcion.value);
    router.push(`${pathname}?${nuevos.toString()}`);
  }

  // El Menu del sistema trata la sección como un item aparte, no como propiedad.
  const items: React.ComponentProps<typeof Menu>["items"] = [];
  if (activa) {
    items.push({ label: "Quitar filtro", onSelect: () => aplicar(null) }, { separator: true });
  }
  let seccion: string | undefined;
  for (const o of opciones) {
    if (o.section && o.section !== seccion) {
      seccion = o.section;
      items.push({ section: o.section });
    }
    items.push({ label: o.label, onSelect: () => aplicar(o) });
  }

  return (
    <Menu
      items={items}
      align="start"
      trigger={
        <button
          type="button"
          className="-mx-1 flex items-center gap-1 rounded px-1 py-0.5 hover:text-[var(--ds-gray-1000)]"
        >
          {activa ? (
            <span className="text-[var(--ds-gray-1000)]">{activa.label}</span>
          ) : (
            etiqueta
          )}
          <ChevronDownIcon className="size-3" />
        </button>
      }
    />
  );
}
