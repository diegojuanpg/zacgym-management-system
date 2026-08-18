"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface DatosPromo {
  nombre: string;
  producto_id: string;
  integrantes: string[];
  activa: boolean;
}

const refrescar = () => {
  revalidatePath("/alumnos");
  revalidatePath("/alumnos/promos");
  revalidatePath("/mostrador");
};

function revisar(datos: DatosPromo): string | null {
  if (datos.nombre.trim() === "") return "Ponele un nombre al grupo.";
  if (!datos.producto_id) return "Elegí qué promo le corresponde.";
  if (datos.integrantes.length === 0) return "Agregá al menos un integrante.";
  return null;
}

/** 23505 sobre promo_integrantes es un alumno que ya está en otra promo. */
async function nombrarChoque(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]) {
  const { data } = await supabase
    .from("alumno_promo")
    .select("alumno_id, promo")
    .in("alumno_id", ids);
  const otros = data ?? [];
  if (otros.length === 0) return "Alguno de los alumnos ya está en otra promo.";

  const { data: nombres } = await supabase
    .from("alumnos")
    .select("id, nombre_completo")
    .in(
      "id",
      otros.map((o) => o.alumno_id),
    );
  const nombre = (id: string) => nombres?.find((n) => n.id === id)?.nombre_completo ?? "Alguien";
  return otros.map((o) => `${nombre(o.alumno_id)} ya está en ${o.promo}`).join(". ");
}

export async function crearPromo(datos: DatosPromo): Promise<{ error?: string }> {
  const mal = revisar(datos);
  if (mal) return { error: mal };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("promos")
    .insert({ nombre: datos.nombre.trim(), producto_id: datos.producto_id })
    .select("id")
    .single();

  if (error) {
    return { error: error.code === "23505" ? "Ya hay una promo con ese nombre." : error.message };
  }

  const { error: errorIntegrantes } = await supabase
    .from("promo_integrantes")
    .insert(datos.integrantes.map((alumno_id) => ({ promo_id: data.id, alumno_id })));

  if (errorIntegrantes) {
    // Sin integrantes la promo no sirve para nada: se deshace el alta entera.
    await supabase.from("promos").delete().eq("id", data.id);
    return {
      error:
        errorIntegrantes.code === "23505"
          ? await nombrarChoque(supabase, datos.integrantes)
          : errorIntegrantes.message,
    };
  }

  refrescar();
  return {};
}

export async function editarPromo(id: string, datos: DatosPromo): Promise<{ error?: string }> {
  const mal = revisar(datos);
  if (mal) return { error: mal };

  const supabase = await createClient();
  const { error } = await supabase
    .from("promos")
    .update({ nombre: datos.nombre.trim(), producto_id: datos.producto_id, activa: datos.activa })
    .eq("id", id);

  if (error) {
    return { error: error.code === "23505" ? "Ya hay una promo con ese nombre." : error.message };
  }

  // La lista se reescribe entera: comparar altas y bajas por separado cuesta
  // más que rehacerla, y son cinco filas.
  await supabase.from("promo_integrantes").delete().eq("promo_id", id);
  const { error: errorIntegrantes } = await supabase
    .from("promo_integrantes")
    .insert(datos.integrantes.map((alumno_id) => ({ promo_id: id, alumno_id })));

  if (errorIntegrantes) {
    return {
      error:
        errorIntegrantes.code === "23505"
          ? await nombrarChoque(supabase, datos.integrantes)
          : errorIntegrantes.message,
    };
  }

  refrescar();
  return {};
}

export async function borrarPromo(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  // Los integrantes se van solos (on delete cascade): la promo no deja rastro
  // en el alumno, solo dejan de tener el precio especial.
  const { error } = await supabase.from("promos").delete().eq("id", id);
  if (error) return { error: error.message };
  refrescar();
  return {};
}
