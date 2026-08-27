"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { editarTarea, type Categoria } from "@/lib/tareas";
import { ChevronDownIcon, PencilIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const SIN_CATEGORIA = "Sin categoría";

/**
 * Selector de categoría para la fila de tareas.
 *
 * Muestra el nombre de la categoría como texto normal.
 * Al hacer clic, se activa el chip desplegable para seleccionar una categoría.
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
  const [editando, setEditando] = React.useState(false);
  const selectRef = React.useRef<HTMLSelectElement>(null);

  const nombreActual = React.useMemo(() => {
    if (!actualId) return null;
    const cat = categorias.find((c) => c.id === actualId);
    return cat ? cat.nombre : categoriaNombre;
  }, [actualId, categorias, categoriaNombre]);

  React.useEffect(() => {
    if (editando && selectRef.current) {
      selectRef.current.focus();
      if ("showPicker" in HTMLSelectElement.prototype) {
        try {
          selectRef.current.showPicker();
        } catch {
          // Si el navegador bloquea showPicker sin gesto directo, el focus alcanza.
        }
      }
    }
  }, [editando]);

  function cambiar(nuevoId: string) {
    setEditando(false);
    empezar(async () => {
      setActualId(nuevoId);
      await editarTarea(id, { categoria_id: nuevoId || null });
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
          value={actualId}
          onChange={(e) => cambiar(e.target.value)}
          onBlur={() => setEditando(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditando(false);
            }
          }}
          disabled={guardando}
          aria-label="Categoría de la tarea"
          className="h-6 cursor-pointer appearance-none truncate rounded-full bg-transparent py-0 pr-6 pl-2.5 text-inherit outline-none"
        >
          {/* La categoría es obligatoria al anotar, así que no se ofrece volver a
              "Sin categoría": dejarlo era una puerta para deshacer la obligación
              desde la tabla. Aparece solo en las tareas viejas, que se cargaron
              antes de que se pidiera y no tienen ninguna. */}
          {!actualId && (
            <option value="" className="bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)]">
              {SIN_CATEGORIA}
            </option>
          )}
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
      title="Clic para editar categoría"
    >
      <span
        className={cn(
          "truncate text-copy-13",
          nombreActual ? "text-[var(--ds-gray-1000)] font-medium" : "text-[var(--ds-gray-900)]",
        )}
      >
        {nombreActual ?? "—"}
      </span>
      <PencilIcon className="size-3 shrink-0 text-[var(--ds-gray-800)] opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}
