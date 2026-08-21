"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface Asistencia {
  id: string;
  empleado_id: string;
  nombre: string;
  /** "Llegaste": el momento del botón. No se elige ni se corrige. */
  entro: string;
  /** Desde cuándo corre el turno. Puede ser anterior a la llegada. */
  inicia: string;
  /** Hasta cuándo. Null solo en jornadas viejas, de antes del check-in. */
  termina: string | null;
  trabajando: boolean;
}

const refrescar = () => {
  revalidatePath("/mostrador");
  revalidatePath("/turnos");
};

/**
 * Check-in. La llegada la pone la base: es el momento del botón, no algo que se
 * elige. Lo que se declara es el turno entero, y puede haber arrancado antes.
 */
export async function ficharAsistencia(
  empleadoId: string,
  inicia: string,
  termina: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fichar_asistencia", {
    p_empleado: empleadoId,
    p_inicia: inicia,
    p_termina: termina,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

/**
 * Corrige el turno declarado. Lo que se puso al fichar es un plan: se arranca
 * antes, se sale después. Las dos horas se mueven; la llegada no.
 */
export async function editarHorario(
  id: string,
  inicia: string,
  termina: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("editar_horario", {
    p_id: id,
    p_inicia: inicia,
    p_termina: termina,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}
