"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { editarMovimiento, editarVenta, editarCobro } from "@/lib/ventas";
import { Button } from "@/components/ui/button";
import { PencilIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Registro } from "@/app/(app)/mostrador/tabla";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

export function MontoEditable({
  registro: r,
  monto,
  tipo,
  anulado,
  extra,
}: {
  registro: Registro;
  monto: number;
  tipo: "ingreso" | "egreso" | "venta" | "cobro";
  anulado: boolean;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [actualMonto, setActualMonto] = React.useOptimistic(monto);
  const [editando, setEditando] = React.useState(false);
  const [valorTexto, setValorTexto] = React.useState(String(monto));
  const [guardando, empezar] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setValorTexto(String(monto));
  }, [monto]);

  React.useEffect(() => {
    if (editando && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editando]);

  if (anulado) {
    return (
      <span className="line-through text-muted-foreground">
        {tipo === "ingreso" ? "+" : tipo === "egreso" ? "−" : ""}
        {pesos(actualMonto)}
      </span>
    );
  }

  function guardar() {
    const num = parseFloat(valorTexto.replace(/[^\d.-]/g, ""));
    if (isNaN(num) || num < 0 || num === actualMonto) {
      setEditando(false);
      setValorTexto(String(actualMonto));
      return;
    }

    setEditando(false);
    empezar(async () => {
      setActualMonto(num);
      if (r.clase === "movimiento") {
        await editarMovimiento(r.id, { monto: num });
      } else if (r.clase === "venta") {
        await editarVenta(r.id, { monto: num });
      } else if (r.clase === "cobro") {
        await editarCobro(r.ids, { monto: num });
      }
      router.refresh();
    });
  }

  function cancelar() {
    setValorTexto(String(actualMonto));
    setEditando(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelar();
    } else if (e.key === "Enter") {
      e.preventDefault();
      guardar();
    }
  }

  if (editando) {
    return (
      <div className="flex items-center gap-1.5 py-0.5">
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="1"
          value={valorTexto}
          onChange={(e) => setValorTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={guardar}
          disabled={guardando}
          aria-label="Monto"
          className="h-7 w-24 rounded border border-[var(--ds-gray-alpha-500)] bg-[var(--ds-background-100)] px-2 text-copy-13 text-[var(--ds-gray-1000)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
        />
        <Button size="sm" onClick={guardar} disabled={guardando}>
          OK
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditando(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditando(true);
          }
        }}
        className={cn(
          "group -m-1 flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--ds-gray-200)]",
          guardando && "opacity-60",
        )}
        title="Clic para editar monto"
      >
        <span
          className={
            tipo === "ingreso"
              ? "text-[var(--ds-green-900)] font-medium"
              : tipo === "egreso"
                ? "text-[var(--ds-amber-900)] font-medium"
                : "text-[var(--ds-gray-1000)]"
          }
        >
          {tipo === "ingreso" ? "+" : tipo === "egreso" ? "−" : ""}
          {pesos(actualMonto)}
        </span>
        <PencilIcon className="size-3 shrink-0 text-[var(--ds-gray-800)] opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      {extra}
    </div>
  );
}
