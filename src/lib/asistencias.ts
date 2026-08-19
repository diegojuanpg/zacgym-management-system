"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface Asistencia {
  id: string;
  empleado_id: string;
  nombre: string;
  entro: string;
  salio: string | null;
  trabajando: boolean;
}

const refrescar = () => {
  revalidatePath("/mostrador");
  revalidatePath("/turnos");
};

/**
 * Ficha la llegada. La entrada la pone la base: es el momento del botón, no
 * algo que se elige. Lo único que se elige es hasta qué hora se queda.
 */
export async function ficharAsistencia(
  empleadoId: string,
  salida: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fichar_asistencia", {
    p_empleado: empleadoId,
    p_salida: salida,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

/** "Me voy": pisa la salida declarada con la hora real. */
export async function terminarAsistencia(
  id: string,
  salio?: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("terminar_asistencia", {
    p_id: id,
    p_salio: salio ?? null,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}
