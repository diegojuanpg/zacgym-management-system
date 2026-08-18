"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EstadoTarea } from "@/lib/tarea-estados";

export interface Categoria {
  id: string;
  nombre: string;
}

export interface DatosTarea {
  alumno_id: string;
  categoria_id: string | null;
  detalle: string;
}

export async function crearTarea(datos: DatosTarea): Promise<{ error?: string }> {
  if (!datos.alumno_id) return { error: "Elegí el alumno." };
  if (datos.detalle.trim() === "") return { error: "Escribí la tarea." };

  const supabase = await createClient();
  const { data: sesion } = await supabase.auth.getUser();
  if (!sesion.user) return { error: "Sesión vencida, entrá de nuevo." };

  const { error } = await supabase.from("tareas").insert({
    alumno_id: datos.alumno_id,
    categoria_id: datos.categoria_id,
    detalle: datos.detalle.trim(),
    creado_por: sesion.user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/mostrador");
  revalidatePath("/tareas");
  return {};
}

export async function cambiarEstadoTarea(
  id: string,
  estado: EstadoTarea,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  // select() para saber si cambio algo: con RLS, un update que no alcanza
  // ninguna fila vuelve sin error y sin haber hecho nada.
  const { data, error } = await supabase
    .from("tareas")
    .update({ estado })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if ((data ?? []).length === 0) return { error: "No se pudo cambiar el estado." };

  revalidatePath("/tareas");
  return {};
}

/** Se cargo mal, nunca existio. Lo que se hizo se marca terminada, no se borra. */
export async function borrarTarea(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tareas").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/tareas");
  revalidatePath("/mostrador");
  return {};
}

export async function crearCategoria(
  nombre: string,
): Promise<{ categoria?: Categoria; error?: string }> {
  if (nombre.trim() === "") return { error: "Poné un nombre." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarea_categorias")
    .insert({ nombre: nombre.trim() })
    .select("id, nombre")
    .single();

  if (error) {
    return { error: error.code === "23505" ? "Ya existe esa categoría." : error.message };
  }

  revalidatePath("/mostrador");
  return { categoria: data };
}

/** Las tareas que la usaban quedan sin categoria, no se borran. */
export async function borrarCategoria(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tarea_categorias").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/mostrador");
  return {};
}
