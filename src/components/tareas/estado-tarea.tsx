"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoTarea } from "@/lib/tareas";
import { ESTADOS, type EstadoTarea } from "@/lib/tarea-estados";
import { ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/** Los mismos colores que las badges del sistema, para que se lean igual. */
const COLOR: Record<EstadoTarea, string> = {
  pendiente: "bg-[var(--ds-red-900)] dark:bg-[var(--ds-red-800)] text-[var(--ds-contrast-fg)]",
  en_proceso: "bg-[var(--ds-amber-700)] text-black",
  terminada: "bg-[var(--ds-blue-800)] text-white",
};

/**
 * En qué anda la tarea, y se cambia desde acá mismo.
 *
 * Es un <select> de verdad y no un menú propio: se abre con el teclado, en el
 * celular usa el selector del sistema y no hay nada que mantener. Va pintado
 * como una badge porque al lado de las otras columnas se lee primero el color.
 */
export function EstadoTareaSelect({ id, estado }: { id: string; estado: EstadoTarea }) {
  const router = useRouter();
  // El color cambia al soltar el mouse, no cuando contesta el server. Y cuando
  // la transicion termina vuelve solo a lo que dice la base, asi que si el
  // guardado falla no queda mintiendo.
  const [valor, setValor] = React.useOptimistic(estado);
  const [guardando, empezar] = React.useTransition();

  function cambiar(nuevo: EstadoTarea) {
    empezar(async () => {
      setValor(nuevo);
      await cambiarEstadoTarea(id, nuevo);
      router.refresh();
    });
  }

  return (
    <span
      className={cn(
        "relative inline-flex h-6 items-center rounded-full text-[12px] font-medium transition-opacity",
        COLOR[valor],
        guardando && "opacity-60",
      )}
    >
      <select
        value={valor}
        onChange={(e) => cambiar(e.target.value as EstadoTarea)}
        disabled={guardando}
        aria-label="Estado de la tarea"
        className="h-6 cursor-pointer appearance-none rounded-full bg-transparent py-0 pr-6 pl-3 text-inherit outline-none focus-visible:shadow-[var(--ds-focus-ring)]"
      >
        {ESTADOS.map((e) => (
          // El desplegable lo pinta el sistema operativo: ahí van en su color normal.
          <option key={e.valor} value={e.valor} className="bg-[var(--ds-background-100)] text-[var(--ds-gray-1000)]">
            {e.nombre}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-1.5 size-3 opacity-80" />
    </span>
  );
}
