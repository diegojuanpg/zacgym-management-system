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

export async function abrirTurno(datos: {
  responsables: string[];
  cajaGrande: number;
  cajaChica: number;
  stock: ConteoStock[];
  /** ISO. Sin esto, la hora del turno es la de apretar el botón. */
  abiertoEn?: string;
}): Promise<{ error?: string }> {
  if (datos.responsables.length === 0) return { error: "Elegí al menos un responsable." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("abrir_turno", {
    p_responsables: datos.responsables,
    p_caja_grande: datos.cajaGrande,
    p_caja_chica: datos.cajaChica,
    p_stock: datos.stock,
    p_abierto_en: datos.abiertoEn ?? null,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

export async function cerrarTurno(datos: {
  cajaGrande: number;
  cajaChica: number;
  stock: ConteoStock[];
  nota: string;
  cerradoEn?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cerrar_turno", {
    p_caja_grande: datos.cajaGrande,
    p_caja_chica: datos.cajaChica,
    p_stock: datos.stock,
    p_nota: datos.nota,
    p_cerrado_en: datos.cerradoEn ?? null,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

/**
 * Suma a alguien al turno que ya está abierto, con la hora a la que llegó.
 *
 * Sin esto, el que entra a mitad de turno o no figura, o figura desde que abrió
 * la caja: dos horas que no estuvo.
 */
export async function sumarResponsable(
  empleadoId: string,
  desde?: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sumar_responsable", {
    p_empleado: empleadoId,
    p_desde: desde ?? null,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

/** Marca la salida de alguien que se va antes de que termine el turno. */
export async function sacarResponsable(
  empleadoId: string,
  hasta?: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sacar_responsable", {
    p_empleado: empleadoId,
    p_hasta: hasta ?? null,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}
