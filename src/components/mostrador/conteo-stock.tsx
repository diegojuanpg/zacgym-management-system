"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import type { ConteoStock } from "@/lib/turnos";

export interface ProductoConStock {
  id: string;
  nombre: string;
  stock: number;
}

const soloNumeros = (v: string) => v.replace(/\D/g, "");

/**
 * Conteo obligatorio del turno. Entran solo los productos marcados en el
 * catálogo: contar los 43 que llevan stock, dos veces por turno, son 86 números
 * que nadie carga. La lista corta se cuenta entera, y esa es la gracia.
 *
 * La diferencia se canta debajo del campo, en el momento: si la ves recién al
 * final ya no te acordás de qué pasó con ese producto.
 */
export function ConteoStock({
  productos,
  contados,
  onCambio,
}: {
  productos: ProductoConStock[];
  contados: Map<string, string>;
  onCambio: (contados: Map<string, string>) => void;
}) {
  const [busqueda, setBusqueda] = React.useState("");

  const texto = busqueda.trim().toLowerCase();
  const visibles = productos.filter((p) => p.nombre.toLowerCase().includes(texto));
  const faltan = productos.filter((p) => (contados.get(p.id) ?? "") === "").length;

  function escribir(id: string, valor: string) {
    const copia = new Map(contados);
    copia.set(id, soloNumeros(valor));
    onCambio(copia);
  }

  if (productos.length === 0) {
    return (
      <p className="text-copy-13 rounded-md border border-[var(--ds-gray-alpha-400)] px-3 py-4 text-[var(--ds-gray-900)]">
        No hay productos marcados para contar. Marcalos en Productos, con la opción “Contar en
        cada turno”.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <SearchInput
          size="small"
          placeholder="Buscar producto..."
          value={busqueda}
          onValueChange={setBusqueda}
        />
        <span className="text-copy-13 shrink-0 text-[var(--ds-gray-900)]">
          {faltan === 0
            ? "Todo contado"
            : `Faltan ${faltan} de ${productos.length}`}
        </span>
      </div>

      <div className="flex max-h-64 flex-col overflow-y-auto overscroll-contain rounded-md border border-[var(--ds-gray-alpha-400)]">
        {visibles.length === 0 ? (
          <p className="text-copy-13 px-3 py-6 text-center text-[var(--ds-gray-900)]">
            Ningún producto coincide
          </p>
        ) : (
          visibles.map((p) => {
            const valor = contados.get(p.id) ?? "";
            const dif = valor === "" ? null : Number(valor) - p.stock;
            return (
              <div
                key={p.id}
                className="flex shrink-0 flex-col gap-1 border-b border-[var(--ds-gray-alpha-300)] px-3 py-2 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--ds-gray-1000)]">
                    {p.nombre}
                  </span>
                  <span className="text-copy-13 shrink-0 text-[var(--ds-gray-900)]">
                    sistema: {p.stock}
                  </span>
                  <div className="w-24 shrink-0">
                    <Input
                      size="small"
                      inputMode="numeric"
                      placeholder="contá"
                      aria-label={`Cuántos ${p.nombre} hay`}
                      value={valor}
                      onChange={(e) => escribir(p.id, e.target.value)}
                    />
                  </div>
                </div>
                {dif !== null && dif !== 0 && <Aviso nombre={p.nombre} dif={dif} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** "Falta 1 Agua 600ml" / "Sobran 2 Monster". */
function Aviso({ nombre, dif }: { nombre: string; dif: number }) {
  const cuantos = Math.abs(dif);
  const verbo = dif < 0 ? (cuantos === 1 ? "Falta" : "Faltan") : cuantos === 1 ? "Sobra" : "Sobran";
  return (
    <p
      className={`text-copy-13 pl-0.5 ${dif < 0 ? "text-[var(--ds-red-900)]" : "text-[var(--ds-amber-900)]"}`}
    >
      {verbo} {cuantos} {nombre}
    </p>
  );
}

/** Todo lo contado, listo para el RPC. */
export function aConteo(contados: Map<string, string>): ConteoStock[] {
  return [...contados]
    .filter(([, valor]) => valor !== "")
    .map(([producto_id, valor]) => ({ producto_id, contado: Number(valor) }));
}

/** El turno no abre ni cierra con productos sin contar. */
export function todoContado(
  productos: ProductoConStock[],
  contados: Map<string, string>,
): boolean {
  return productos.every((p) => (contados.get(p.id) ?? "") !== "");
}
