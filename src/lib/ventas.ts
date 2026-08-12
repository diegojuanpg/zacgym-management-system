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

export async function registrarVentas(items: ItemVenta[]): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_ventas", { p_items: items });
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
