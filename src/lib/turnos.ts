"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface Empleado {
  id: string;
  nombre: string;
}

export interface ConteoStock {
  producto_id: string;
  contado: number;
}

const refrescar = () => {
  revalidatePath("/mostrador");
  revalidatePath("/ventas");
  revalidatePath("/productos");
};

export async function crearEmpleado(
  nombre: string,
): Promise<{ empleado?: Empleado; error?: string }> {
  if (nombre.trim() === "") return { error: "Poné un nombre." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("empleados")
    .insert({ nombre: nombre.trim() })
    .select("id, nombre")
    .single();

  if (error) {
    return { error: error.code === "23505" ? "Ya existe ese empleado." : error.message };
  }
  refrescar();
  return { empleado: data };
}

/**
 * Abre el turno. No pregunta ni la hora ni quién está a cargo: arranca ahora, y
 * quién estaba sale de cruzar el rango con las asistencias fichadas.
 */
export async function abrirTurno(datos: {
  cajaGrande: number;
  cajaChica: number;
  stock: ConteoStock[];
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("abrir_turno", {
    p_caja_grande: datos.cajaGrande,
    p_caja_chica: datos.cajaChica,
    p_stock: datos.stock,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

/** Cierra el turno acá y ahora: la hora es la de apretar el botón. */
export async function cerrarTurno(datos: {
  cajaGrande: number;
  cajaChica: number;
  stock: ConteoStock[];
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cerrar_turno", {
    p_caja_grande: datos.cajaGrande,
    p_caja_chica: datos.cajaChica,
    p_stock: datos.stock,
    // La nota se saco de la pantalla: lo que no cuadra ya queda en los numeros.
    p_nota: null,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}
