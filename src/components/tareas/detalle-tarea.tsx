"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { editarTarea } from "@/lib/tareas";
import { Button } from "@/components/ui/button";
import { PencilIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Detalle de la tarea editable directamente en la tabla.
 *
 * Muestra el texto de la tarea con un indicador de edición en hover.
 * Al hacer clic, se convierte en un área de texto con controles de Guardar y Cancelar.
 */
export function DetalleTareaEditable({
  id,
  detalle,
}: {
  id: string;
  detalle: string;
}) {
  const router = useRouter();
  const [optimisticDetalle, setOptimisticDetalle] = React.useOptimistic(detalle);
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState(detalle);
  const [guardando, empezar] = React.useTransition();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    setTexto(detalle);
  }, [detalle]);

  React.useEffect(() => {
    if (editando && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [editando]);

  function guardar() {
    const limpio = texto.trim();
    if (!limpio || limpio === optimisticDetalle) {
      setEditando(false);
      setTexto(optimisticDetalle);
      return;
    }

    setEditando(false);
    empezar(async () => {
      setOptimisticDetalle(limpio);
      await editarTarea(id, { detalle: limpio });
      router.refresh();
    });
  }

  function cancelar() {
    setTexto(optimisticDetalle);
    setEditando(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelar();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      guardar();
    }
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-2 py-1">
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={guardando}
          rows={2}
          className="w-full resize-y rounded-md border border-[var(--ds-gray-alpha-500)] bg-[var(--ds-background-100)] p-2 text-copy-13 text-[var(--ds-gray-1000)] outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={guardar} disabled={guardando || texto.trim() === ""}>
            Guardar
          </Button>
          <Button size="sm" variant="tertiary" onClick={cancelar} disabled={guardando}>
            Cancelar
          </Button>
          <span className="text-copy-12 text-[var(--ds-gray-800)]">
            Enter para guardar, Esc para cancelar
          </span>
        </div>
      </div>
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
        "group -m-1 flex cursor-pointer items-start justify-between gap-2 rounded p-1 text-left transition-colors hover:bg-[var(--ds-gray-200)]",
        guardando && "opacity-60",
      )}
      title="Clic para editar"
    >
      <span className="whitespace-normal text-[var(--ds-gray-1000)]">
        {optimisticDetalle}
      </span>
      <PencilIcon className="mt-0.5 size-3.5 shrink-0 text-[var(--ds-gray-800)] opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}
