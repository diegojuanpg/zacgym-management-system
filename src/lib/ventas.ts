"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ItemVenta {
  alumno_id: string;
  producto_id: string;
  cantidad: number;
  /** Lo que entregó en cada forma. Los dos en 0 = queda debiendo el total. */
  efectivo: number;
  transferencia: number;
}

export interface ItemMovimiento {
  tipo: "ingreso" | "egreso";
  monto: number;
  motivo: string;
  caja: "grande" | "chica";
  metodo: "efectivo" | "transferencia";
}

/** Ventas y movimientos del mismo lote, en una sola transacción. */
export async function registrarLote(
  ventas: ItemVenta[],
  movimientos: ItemMovimiento[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_lote", {
    p_ventas: ventas,
    p_movimientos: movimientos,
  });
  if (error) return { error: error.message };
  revalidatePath("/mostrador");
  return {};
}

export async function anularVenta(ventaId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_venta", { p_venta_id: ventaId });
  if (error) return { error: error.message };
  revalidatePath("/mostrador");
  return {};
}

export async function anularMovimiento(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_movimiento", { p_movimiento_id: id });
  if (error) return { error: error.message };
  revalidatePath("/mostrador");
  return {};
}
