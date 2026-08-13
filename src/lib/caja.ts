"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface Movimiento {
  tipo: "ingreso" | "egreso";
  monto: number;
  motivo: string;
  caja: "grande" | "chica";
  metodo: "efectivo" | "transferencia";
}

export async function registrarMovimiento(m: Movimiento): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_movimiento", {
    p_tipo: m.tipo,
    p_monto: m.monto,
    p_motivo: m.motivo,
    p_caja: m.caja,
    p_metodo: m.metodo,
  });
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
