"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { marcarCargada } from "@/lib/ventas";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * El acuse de que una mensualidad ya se cargó afuera: uno para la planilla y
 * otro para la app de pagos.
 *
 * Se marca optimista y recién después se guarda: son ocho por día y esperar el
 * viaje al server en cada tilde hace que el mostrador parezca colgado. Si el
 * guardado falla, el tilde vuelve solo a donde estaba.
 */
export function TildeCarga({
  ventaId,
  donde,
  cargadaEn,
  etiqueta,
}: {
  ventaId: string;
  donde: "sheet" | "app";
  /** El momento en que se cargó, o null si está pendiente. */
  cargadaEn: string | null;
  /** Para el lector de pantalla: el tilde solo no dice de qué venta es. */
  etiqueta: string;
}) {
  const router = useRouter();
  const [marcada, setMarcada] = React.useOptimistic(cargadaEn !== null);
  const [, empezar] = React.useTransition();

  return (
    <Checkbox
      checked={marcada}
      aria-label={etiqueta}
      title={cargadaEn ? `Cargada el ${new Date(cargadaEn).toLocaleString("es-AR")}` : etiqueta}
      onCheckedChange={(valor) =>
        empezar(async () => {
          const quiere = valor === true;
          setMarcada(quiere);
          await marcarCargada(ventaId, donde, quiere);
          // El refresh trae el estado real: si el update no entró, el tilde
          // vuelve a como estaba en la base en vez de quedar mintiendo.
          router.refresh();
        })
      }
    />
  );
}
