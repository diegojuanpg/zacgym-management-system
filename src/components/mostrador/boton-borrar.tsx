"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  borrarVenta,
  borrarMovimiento,
  borrarPago,
  registrarLote,
} from "@/lib/ventas";
/**
 * Lo mínimo para borrar algo y poder volver a cargarlo igual. Es propio y no el
 * `Registro` del mostrador porque la tabla de Ventas tiene su propia forma y las
 * dos borran lo mismo.
 */
export type Borrable =
  | {
      clase: "venta";
      id: string;
      turno_id: string;
      creado_en: string;
      alumno_id: string;
      producto_id: string;
      cantidad: number;
      efectivo: number;
      transferencia: number;
      no_paga: number;
    }
  | {
      clase: "movimiento";
      id: string;
      turno_id: string;
      creado_en: string;
      tipo: "ingreso" | "egreso";
      monto: number;
      motivo: string;
      caja: "grande" | "chica";
      metodo: "efectivo" | "transferencia";
    }
  | {
      clase: "cobro";
      ids: string[];
      turno_id: string;
      creado_en: string;
      alumno_id: string;
      efectivo: number;
      transferencia: number;
    };

/**
 * Eliminar con red: avisa qué se borró y deja deshacerlo por unos segundos.
 *
 * Deshacer no resucita la fila —el borrado es real y no deja rastro— sino que
 * la vuelve a cargar en el mismo turno y con la misma hora, que es lo que hace
 * que la caja y el día queden igual que antes. Por eso necesita los ids del
 * alumno y del producto y no solo sus nombres.
 *
 * Lo que no vuelve: si la venta tenía saldo a favor imputado, la imputación se
 * rehace desde cero. Da el mismo saldo, pero los asientos son nuevos.
 */
export function BotonBorrar({ registro: r, etiqueta }: { registro: Borrable; etiqueta: string }) {
  const router = useRouter();
  const [borrando, setBorrando] = React.useState(false);

  async function rehacer() {
    const en = { turnoId: r.turno_id, creadoEn: r.creado_en };
    const { error } =
      r.clase === "venta"
        ? await registrarLote(
            [
              {
                alumno_id: r.alumno_id,
                producto_id: r.producto_id,
                cantidad: r.cantidad,
                efectivo: r.efectivo,
                transferencia: r.transferencia,
                no_paga: r.no_paga,
              },
            ],
            [],
            [],
            en,
          )
        : r.clase === "movimiento"
          ? await registrarLote(
              [],
              [{ tipo: r.tipo, monto: r.monto, motivo: r.motivo, caja: r.caja, metodo: r.metodo }],
              [],
              en,
            )
          : await registrarLote(
              [],
              [],
              [{ alumno_id: r.alumno_id, efectivo: r.efectivo, transferencia: r.transferencia }],
              en,
            );

    if (error) toast.error(`No se pudo deshacer: ${error}`);
    router.refresh();
  }

  async function borrar() {
    setBorrando(true);
    const { error } =
      r.clase === "venta"
        ? await borrarVenta(r.id)
        : r.clase === "movimiento"
          ? await borrarMovimiento(r.id)
          : // Un cobro puede haberse repartido en varios pagos: se van todos.
            await r.ids.reduce<Promise<{ error?: string }>>(
              async (previo, id) => (await previo).error ? previo : borrarPago(id),
              Promise.resolve({}),
            );
    setBorrando(false);
    if (error) return toast.error(error);

    toast(`${etiqueta} eliminado`, {
      duration: 8000,
      action: { label: "Deshacer", onClick: rehacer },
    });
    router.refresh();
  }

  return (
    <Button
      variant="tertiary"
      size="sm"
      loading={borrando}
      onClick={borrar}
      aria-label={`Eliminar ${etiqueta}`}
      className="hover:bg-[var(--ds-red-200)] hover:text-[var(--ds-red-900)]"
    >
      Eliminar
    </Button>
  );
}
