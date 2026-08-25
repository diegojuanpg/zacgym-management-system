"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ItemVenta {
  alumno_id: string;
  producto_id: string;
  cantidad: number;
  /** Lo que entregó en cada forma. Los tres en 0 = queda debiendo el total. */
  efectivo: number;
  transferencia: number;
  /** Sin cargo: lo que se lleva el dueño. Salda la venta sin que entre plata. */
  no_paga: number;
}

export interface ItemMovimiento {
  tipo: "ingreso" | "egreso";
  monto: number;
  motivo: string;
  caja: "grande" | "chica";
  metodo: "efectivo" | "transferencia";
  /** Devolución: además de sacar la plata del cajón, le baja el saldo a favor. */
  alumno_id?: string;
}

export interface ItemCobro {
  alumno_id: string;
  /** Lo que entrega contra deudas viejas. Se imputa FIFO a las más antiguas. */
  efectivo: number;
  transferencia: number;
}

/** Ventas, movimientos y cobros del mismo lote, en una sola transacción. */
export async function registrarLote(
  ventas: ItemVenta[],
  movimientos: ItemMovimiento[],
  cobros: ItemCobro[] = [],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_lote", {
    p_ventas: ventas,
    p_movimientos: movimientos,
    p_cobros: cobros,
  });
  if (error) return { error: error.message };
  revalidatePath("/mostrador");
  return {};
}

// Borrado real, sin papelera: la fila se va de la base y no queda registro de
// quién la borró. Los dos listados (mostrador y ventas) llaman acá, así que
// se comportan igual; refrescamos los dos.
const refrescar = () => {
  revalidatePath("/mostrador");
  revalidatePath("/ventas");
  revalidatePath("/alumnos");
};

/** Borra la venta con sus pagos y devuelve el stock. */
export async function borrarVenta(ventaId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("borrar_venta", { p_venta_id: ventaId });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

export async function borrarMovimiento(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("borrar_movimiento", { p_movimiento_id: id });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

/** Un cobro se borra pago por pago: uno solo pudo saldar varias compras. */
export async function borrarPago(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_pago", { p_pago_id: id });
  if (error) return { error: error.message };
  refrescar();
  return {};
}
