"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarGrid } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [tipeada, setTipeada] = React.useState(dia);
  const [error, setError] = React.useState<string | null>(null);

  const conVentas = React.useMemo(() => new Set(dias), [dias]);
  const seleccionado = aFecha(dia);

  useDismissable(ref, abierto, () => setAbierto(false));

  function ir(destino: string) {
    setAbierto(false);
    setError(null);
    router.push(`/mostrador?fecha=${destino}`);
  }

  function confirmarTipeada(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tipeada)) {
      setError("Fecha incompleta.");
      return;
    }
    if (!conVentas.has(tipeada)) {
      setError("Ese día no tiene ventas cargadas.");
      return;
    }
    ir(tipeada);
  }

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
        onClick={() => {
          setAbierto((a) => !a);
          setTipeada(dia);
          setError(null);
        }}
        prefix={<CalendarIcon />}
        suffix={<ChevronDownIcon />}
        aria-haspopup="dialog"
        aria-expanded={abierto}
      >
        {etiqueta}
      </Button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Elegir día"
          className="material-menu absolute top-full left-0 z-50 mt-1 flex w-max flex-col gap-3 p-3"
        >
          <form onSubmit={confirmarTipeada} className="flex items-end gap-2">
            <Input
              type="date"
              label="Escribir fecha"
              size="small"
              value={tipeada}
              error={error ?? false}
              onChange={(e) => {
                setTipeada(e.target.value);
                setError(null);
              }}
            />
            <Button type="submit" variant="secondary" size="sm">
              Ir
            </Button>
          </form>

          <CalendarGrid
            mode="single"
            selected={seleccionado}
            defaultMonth={seleccionado}
            // Los dias sin movimientos no se pueden elegir: no hay nada que ver.
            disabled={(fecha: Date) => !conVentas.has(aTexto(fecha))}
            onSelect={(fecha) => fecha && ir(aTexto(fecha))}
          />
        </div>
      )}
    </div>
  );
}
