"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { editarTarea, type Categoria } from "@/lib/tareas";
import { ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const SIN_CATEGORIA = "Sin categoría";

/**
 * Selector de categoría para la fila de tareas.
 *
 * Permite cambiar la categoría directamente en la tabla usando un <select>
 * nativo estilizado como badge Geist.
 */
export function CategoriaTareaSelect({
  id,
  categoriaId,
  categoriaNombre,
  categorias,
}: {
  id: string;
  categoriaId: string | null;
  categoriaNombre: string | null;
  categorias: Categoria[];
}) {
  const router = useRouter();
  const [actualId, setActualId] = React.useOptimistic(categoriaId ?? "");
  const [guardando, empezar] = React.useTransition();

  const tieneCategoria = Boolean(actualId);

  function cambiar(nuevoId: string) {
    empezar(async () => {
      setActualId(nuevoId);
      await editarTarea(id, { categoria_id: nuevoId || null });
      router.refresh();
    });
  }

  return (
    <span
      className={cn(
        "relative inline-flex h-6 max-w-full items-center rounded-full text-[12px] font-medium transition-opacity",
        tieneCategoria
          ? "bg-[var(--ds-gray-200)] text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-300)]"
          : "bg-transparent text-[var(--ds-gray-900)] hover:bg-[var(--ds-gray-200)]",
        guardando && "opacity-60",
      )}
    >
      <select
        value={actualId}
        onChange={(e) => cambiar(e.target.value)}
        disabled={guardando}
        aria-label="Categoría de la tarea"
        className="h-6 cursor-pointer appearance-none truncate rounded-full bg-transparent py-0 pr-5 pl-2 text-inherit outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        <option value="" className="bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)]">
          {SIN_CATEGORIA}
        </option>
        {categorias.map((c) => (
          <option
            key={c.id}
            value={c.id}
            className="bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)]"
          >
            {c.nombre}
          </option>
        ))}
        {!categorias.some((c) => c.id === actualId) && actualId && categoriaNombre ? (
          <option value={actualId} className="bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)]">
            {categoriaNombre}
          </option>
        ) : null}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-1 size-3 opacity-60" />
    </span>
  );
}
