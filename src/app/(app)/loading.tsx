import { cn } from "@/lib/utils";

/**
 * Lo que se ve mientras la sección siguiente se arma en el server.
 *
 * Va una sola vez en el grupo y no en cada sección: todas tienen la misma
 * forma —título, una fila de controles y una tabla—, así que un esqueleto las
 * cubre a todas.
 *
 * Sin esto la app parecía colgada. Next no pinta nada hasta que el server
 * termina, así que tocar el menú no daba ninguna señal durante dos segundos.
 */
export default function Cargando() {
  return (
    <div className="flex flex-1 flex-col gap-4" aria-busy="true" aria-label="Cargando">
      <div className="flex flex-col gap-2">
        <Bloque className="h-6 w-44" />
        <Bloque className="h-4 w-72" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Bloque className="h-8 w-24" />
        <Bloque className="h-8 w-28" />
        <Bloque className="h-8 w-20" />
        <Bloque className="ml-auto h-9 w-72" />
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)]">
        <div className="border-b border-[var(--ds-gray-alpha-400)] bg-[var(--ds-gray-alpha-100)] px-4 py-3">
          <Bloque className="h-4 w-full max-w-md" />
        </div>
        {/* Ocho renglones: los suficientes para que se lea como una tabla y no
            como una caja vacía. */}
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="border-b border-[var(--ds-gray-alpha-300)] px-4 py-3 last:border-0">
            <Bloque className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bloque({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-[var(--ds-gray-alpha-200)]", className)} />
  );
}
