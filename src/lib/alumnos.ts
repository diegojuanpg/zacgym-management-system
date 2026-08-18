"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface DatosAlumno {
  apellido: string;
  nombre: string;
  nacimiento: string | null;
  genero: "femenino" | "masculino" | "otro" | null;
  celular: string | null;
  email: string | null;
}

/** La ficha completa: lo del alta más lo que solo se toca editando. */
export interface DatosFicha extends DatosAlumno {
  vence: string | null;
  activo: boolean;
}

export interface AlumnoCreado {
  id: string;
  nombre_completo: string;
}

const limpio = (v: string | null) => {
  const t = v?.trim();
  return t ? t : null;
};

function revisar(datos: DatosAlumno): string | null {
  if (datos.apellido.trim() === "" || datos.nombre.trim() === "") {
    return "El apellido y el nombre son obligatorios.";
  }
  // La base lo deja nulo por las fichas viejas; el alta nueva no.
  if (!datos.genero) return "Elegí el género.";
  return null;
}

/** Alta desde el mostrador. Solo el nombre es obligatorio: el resto se completa después. */
export async function crearAlumno(
  datos: DatosAlumno,
): Promise<{ alumno?: AlumnoCreado; error?: string }> {
  const mal = revisar(datos);
  if (mal) return { error: mal };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alumnos")
    .insert({
      apellido: datos.apellido.trim(),
      nombre: datos.nombre.trim(),
      nacimiento: limpio(datos.nacimiento),
      genero: datos.genero,
      celular: limpio(datos.celular),
      email: limpio(datos.email),
    })
    .select("id, nombre_completo")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505" ? "Ya hay un alumno con ese apellido y nombre." : error.message,
    };
  }

  revalidatePath("/mostrador");
  revalidatePath("/alumnos");
  return { alumno: data as AlumnoCreado };
}

export async function editarAlumno(
  id: string,
  datos: DatosFicha,
): Promise<{ error?: string }> {
  const mal = revisar(datos);
  if (mal) return { error: mal };

  const supabase = await createClient();
  const { error } = await supabase
    .from("alumnos")
    .update({
      apellido: datos.apellido.trim(),
      nombre: datos.nombre.trim(),
      nacimiento: limpio(datos.nacimiento),
      genero: datos.genero,
      celular: limpio(datos.celular),
      email: limpio(datos.email),
      vence: limpio(datos.vence),
      activo: datos.activo,
    })
    .eq("id", id);

  if (error) {
    return {
      error:
        error.code === "23505" ? "Ya hay otro alumno con ese apellido y nombre." : error.message,
    };
  }

  revalidatePath("/mostrador");
  revalidatePath("/alumnos");
  return {};
}

/**
 * Borrado real, sin papelera. Solo alcanza a fichas sin historia: ventas y
 * tareas apuntan al alumno con on delete restrict, y esa plata es parte del
 * arqueo de su día. Para el resto está `activo = false`, que lo saca del
 * mostrador sin romper el historial.
 */
export async function borrarAlumno(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const [{ count: ventas }, { count: tareas }] = await Promise.all([
    supabase.from("ventas").select("id", { count: "exact", head: true }).eq("alumno_id", id),
    supabase.from("tareas").select("id", { count: "exact", head: true }).eq("alumno_id", id),
  ]);

  if ((ventas ?? 0) > 0 || (tareas ?? 0) > 0) {
    const partes = [];
    if (ventas) partes.push(`${ventas} ${ventas === 1 ? "movimiento" : "movimientos"}`);
    if (tareas) partes.push(`${tareas} ${tareas === 1 ? "tarea" : "tareas"}`);
    return {
      error: `No se puede borrar: tiene ${partes.join(" y ")}. Marcalo como inactivo para sacarlo del mostrador sin perder el historial.`,
    };
  }

  // select() para saber si borró algo: con RLS, a quien no es admin el delete
  // no le falla, simplemente no toca ninguna fila.
  const { data, error } = await supabase.from("alumnos").delete().eq("id", id).select("id");

  if (error) {
    return {
      error:
        error.code === "23503"
          ? "No se puede borrar: le quedó historial cargado."
          : error.message,
    };
  }
  if (!data || data.length === 0) {
    return { error: "Solo un admin puede borrar una ficha." };
  }

  revalidatePath("/mostrador");
  revalidatePath("/alumnos");
  return {};
}
