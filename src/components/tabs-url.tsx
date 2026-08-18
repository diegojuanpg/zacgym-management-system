"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";

export interface VistaTab {
  valor: string;
  nombre: string;
  /** Se muestra al lado del título. En cero no se dibuja. */
  cuantos?: number;
}

/**
 * Tabs del sistema atadas a un parámetro de la URL: el estado se comparte, se
 * puede marcar y sobrevive al refresh, y el filtrado sigue pasando en el server.
 */
export function TabsUrl({
  param,
  valor,
  vistas,
}: {
  param: string;
  valor: string;
  vistas: VistaTab[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Tabs
      variant="secondary"
      // Las solapas del sistema vienen en h-6 (24px), demasiado bajas para el
      // mostrador. La API de array no deja pasar clases por solapa: van desde acá.
      className="[&_button]:h-8 [&_button]:px-3"
      selected={valor}
      setSelected={(elegido) => {
        const nuevos = new URLSearchParams(searchParams.toString());
        nuevos.set(param, elegido);
        router.push(`${pathname}?${nuevos.toString()}`);
      }}
      tabs={vistas.map((v) => ({
        value: v.valor,
        title: (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {v.nombre}
            {v.cuantos ? (
              <Badge variant="gray-subtle" size="sm">
                {v.cuantos}
              </Badge>
            ) : null}
          </span>
        ),
      }))}
    />
  );
}
