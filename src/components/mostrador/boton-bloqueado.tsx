"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Botón muerto mientras no haya turno abierto.
 *
 * El disabled va en el botón, pero el tooltip cuelga del span de afuera: un
 * elemento deshabilitado no dispara eventos de mouse, así que si el tooltip
 * fuera del botón no aparecería nunca, que es justo cuando hace falta.
 */
export function BotonBloqueado({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip text="Iniciá el turno para poder cargar movimientos">
      <span className="inline-flex">
        <Button variant="secondary" disabled>
          {children}
        </Button>
      </span>
    </Tooltip>
  );
}
