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

/**
 * Corrige lo declarado en un turno: con cuánto arrancó cada caja, con cuánto la
 * cerraron y cuánto se contó de cada producto.
 *
 * Lo que va en `null` se deja como está. Corregir un conteo de apertura
 * recalcula lo que el cierre esperaba de ese producto, así el turno no queda
 * arreglado de un lado y marcando diferencias del otro.
 *
 * No toca el stock de hoy ni el turno siguiente: arregla el registro de ese
 * turno y nada más. Queda anotado quién corrigió y cuándo.
 */
export async function corregirTurno(
  turnoId: string,
  datos: {
    grandeInicial?: number | null;
    chicaInicial?: number | null;
    grandeFinal?: number | null;
    chicaFinal?: number | null;
    stock?: { producto_id: string; momento: "apertura" | "cierre"; contado: number }[];
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("corregir_turno", {
    p_turno_id: turnoId,
    p_grande_inicial: datos.grandeInicial ?? null,
    p_chica_inicial: datos.chicaInicial ?? null,
    p_grande_final: datos.grandeFinal ?? null,
    p_chica_final: datos.chicaFinal ?? null,
    p_stock: datos.stock ?? [],
  });
  if (error) return { error: error.message };
  revalidatePath("/turnos");
  revalidatePath("/mostrador");
  return {};
}
