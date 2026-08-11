"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarGrid } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { useDismissable } from "@/hooks/use-dismissable";
import { CalendarIcon, ChevronDownIcon } from "@/components/icons";

/** "2026-08-11" -> Date local, sin corrimiento por zona horaria. */
function aFecha(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function aTexto(fecha: Date) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(
    fecha.getDate(),
  ).padStart(2, "0")}`;
}

export function SelectorDia({ dia, dias }: { dia: string; dias: string[] }) {
  const router = useRouter();
  const ref = React.useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = React.useState(false);

  const conVentas = React.useMemo(() => new Set(dias), [dias]);
  const seleccionado = aFecha(dia);

  useDismissable(ref, abierto, () => setAbierto(false));

  const etiqueta = seleccionado.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        onClick={() => setAbierto((a) => !a)}
        prefix={<CalendarIcon />}
        suffix={<ChevronDownIcon />}
        aria-haspopup="dialog"
        aria-expanded={abierto}
      >
        {etiqueta}
      </Button>

      {abierto && (
        <div role="dialog" className="material-menu absolute top-full left-0 z-50 mt-1 w-max p-2">
          <CalendarGrid
            mode="single"
            selected={seleccionado}
            defaultMonth={seleccionado}
            // Los dias sin movimientos no se pueden elegir: no hay nada que ver.
            disabled={(fecha: Date) => !conVentas.has(aTexto(fecha))}
            onSelect={(fecha) => {
              if (!fecha) return;
              setAbierto(false);
              router.push(`/mostrador?fecha=${aTexto(fecha)}`);
            }}
          />
        </div>
      )}
    </div>
  );
}
