"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { editarMovimiento, editarVenta, editarCobro } from "@/lib/ventas";
import { ChevronDownIcon, PencilIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Registro } from "@/app/(app)/mostrador/tabla";

const METODOS = [
  { valor: "efectivo", nombre: "Efectivo" },
  { valor: "transferencia", nombre: "Transferencia" },
] as const;

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function MetodoPagoSelect({
  registro: r,
  anulado,
}: {
  registro: Registro;
  anulado: boolean;
}) {
  const router = useRouter();

  const metodoInicial =
    r.clase === "movimiento"
      ? r.metodo
      : r.efectivo > 0 && r.transferencia === 0
        ? "efectivo"
        : r.transferencia > 0 && r.efectivo === 0
          ? "transferencia"
          : "efectivo";

  const labelInicial =
    r.clase === "movimiento"
      ? capitalizar(r.metodo)
      : r.clase === "venta"
        ? r.no_paga > 0
          ? "No paga"
          : r.a_favor > 0
            ? "A favor"
            : r.efectivo > 0 && r.transferencia > 0
              ? "Mixto"
              : r.efectivo > 0
                ? "Efectivo"
                : r.transferencia > 0
                  ? "Transferencia"
                  : "—"
        : r.efectivo > 0 && r.transferencia > 0
          ? "Mixto"
          : r.efectivo > 0
            ? "Efectivo"
            : r.transferencia > 0
              ? "Transferencia"
              : "—";

  const [actualMetodo, setActualMetodo] = React.useOptimistic(metodoInicial);
  const [actualLabel, setActualLabel] = React.useOptimistic(labelInicial);
  const [guardando, empezar] = React.useTransition();
  const [editando, setEditando] = React.useState(false);
  const selectRef = React.useRef<HTMLSelectElement>(null);

  React.useEffect(() => {
    if (editando && selectRef.current) {
      selectRef.current.focus();
      if ("showPicker" in HTMLSelectElement.prototype) {
        try {
          selectRef.current.showPicker();
        } catch {
          // Si el navegador bloquea showPicker, el focus es suficiente
        }
      }
    }
  }, [editando]);

  if (anulado) {
    return <span className="text-muted-foreground">{actualLabel}</span>;
  }

  function cambiar(nuevoMetodo: "efectivo" | "transferencia") {
    setEditando(false);
    empezar(async () => {
      setActualMetodo(nuevoMetodo);
      setActualLabel(capitalizar(nuevoMetodo));

      if (r.clase === "movimiento") {
        await editarMovimiento(r.id, { metodo: nuevoMetodo });
      } else if (r.clase === "venta") {
        await editarVenta(r.id, { metodo: nuevoMetodo });
      } else if (r.clase === "cobro") {
        await editarCobro(r.ids, { metodo: nuevoMetodo });
      }
      router.refresh();
    });
  }

  if (editando) {
    return (
      <span
        className={cn(
          "relative inline-flex h-6 max-w-full items-center rounded-full bg-[var(--ds-gray-200)] text-[12px] font-medium text-[var(--ds-gray-1000)] shadow-[var(--ds-focus-ring)]",
          guardando && "opacity-60",
        )}
      >
        <select
          ref={selectRef}
          value={actualMetodo}
          onChange={(e) => cambiar(e.target.value as "efectivo" | "transferencia")}
          onBlur={() => setEditando(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditando(false);
            }
          }}
          disabled={guardando}
          aria-label="Método de pago"
          className="h-6 cursor-pointer appearance-none truncate rounded-full bg-transparent py-0 pr-6 pl-2.5 text-inherit outline-none"
        >
          {METODOS.map((m) => (
            <option
              key={m.valor}
              value={m.valor}
              className="bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)]"
            >
              {m.nombre}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-1.5 size-3 opacity-60" />
      </span>
    );
  }

  return (
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
        "group -m-1 flex max-w-full cursor-pointer items-center justify-between gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--ds-gray-200)]",
        guardando && "opacity-60",
      )}
      title="Clic para editar método de pago"
    >
      <span className="truncate text-copy-13 text-[var(--ds-gray-1000)]">
        {actualLabel}
      </span>
      <PencilIcon className="size-3 shrink-0 text-[var(--ds-gray-800)] opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}
