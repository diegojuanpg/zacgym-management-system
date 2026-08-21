"use client";

import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useNavegacion } from "@/hooks/use-navegacion";

/**
 * Interruptor atado a un parámetro de la URL, como las solapas y el buscador: el
 * estado se comparte, sobrevive al refresh y el server sigue siendo el que decide
 * qué se dibuja.
 *
 * El estado por defecto no escribe nada en la URL: el link limpio es el normal.
 * El otro pone `?<param>=si` o `?<param>=no`, según de cuál se salga.
 *
 * Va pintado igual que una solapa secundaria del sistema —encendido en claro,
 * apagado en gris— porque convive con ellas en la misma fila y una píldora con
 * otra forma se leería como otra cosa. Es un botón de dos estados, no una vista:
 * por eso `aria-pressed` y no `aria-selected`.
 */
export function ToggleUrl({
  param,
  etiqueta,
  encendido,
  predeterminado = true,
}: {
  param: string;
  etiqueta: string;
  encendido: boolean;
  /** En qué estado arranca sin parámetro en la URL. */
  predeterminado?: boolean;
}) {
  const searchParams = useSearchParams();
  const { irA, cargando } = useNavegacion();

  function alternar() {
    const nuevos = new URLSearchParams(searchParams.toString());
    // Volver al estado por defecto limpia el parámetro en vez de escribir el
    // valor: dos URLs distintas para la misma pantalla no ayudan a nadie.
    if (encendido === predeterminado) nuevos.set(param, encendido ? "no" : "si");
    else nuevos.delete(param);
    irA(nuevos);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={encendido}
      disabled={cargando}
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-3 text-[13px] font-medium whitespace-nowrap outline-none transition-all duration-150 ease-in-out focus-visible:shadow-[var(--ds-focus-ring)]",
        encendido
          ? "bg-[var(--ds-gray-1000)] text-[var(--ds-background-100)]"
          : "bg-[var(--ds-gray-alpha-200)] text-[var(--ds-gray-900)] hover:bg-[var(--ds-gray-alpha-300)] hover:text-[var(--ds-gray-1000)]",
      )}
    >
      {etiqueta}
    </button>
  );
}
