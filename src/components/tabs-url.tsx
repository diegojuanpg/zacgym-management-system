"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { useNavegacion } from "@/hooks/use-navegacion";

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
  const searchParams = useSearchParams();
  const { irA, cargando } = useNavegacion();

  return (
    <Tabs
      variant="secondary"
      // Las solapas del sistema vienen en h-6 (24px), demasiado bajas para el
      // mostrador. La API de array no deja pasar clases por solapa: van desde acá.
      // Mientras el server contesta las solapas se apagan un poco y dejan de
      // aceptar clicks: es la unica senal de que el click entro.
      className={cn(
        "[&_button]:h-8 [&_button]:px-3",
        cargando && "pointer-events-none opacity-60",
      )}
      selected={valor}
      setSelected={(elegido) => {
        const nuevos = new URLSearchParams(searchParams.toString());
        nuevos.set(param, elegido);
        irA(nuevos);
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
