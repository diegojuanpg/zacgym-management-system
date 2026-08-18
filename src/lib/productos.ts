"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Categoria = "mensualidad" | "consumible" | "suplemento";

export interface DatosProducto {
  nombre: string;
  precio: number;
  /** null = todavía sin clasificar. */
  categoria: Categoria | null;
  /** null = todavía sin asignar; el efectivo se cuenta en la caja grande. */
  caja: "grande" | "chica" | null;
  /** null = no se controla stock (cuotas, pases, servicios). */
  stock: number | null;
  /** Si entra al conteo obligatorio de apertura y cierre de turno. */
  contar_en_turno: boolean;
}

function refrescar() {
  revalidatePath("/productos");
  revalidatePath("/mostrador");
}

function valido(datos: DatosProducto): string | null {
  if (datos.nombre.trim() === "") return "Ponele un nombre al producto.";
  if (!Number.isInteger(datos.precio) || datos.precio < 0) return "El precio no es válido.";
  if (datos.stock !== null && (!Number.isInteger(datos.stock) || datos.stock < 0)) {
    return "El stock no es válido.";
  }
  return null;
}

export async function crearProducto(datos: DatosProducto): Promise<{ error?: string }> {
  const mal = valido(datos);
  if (mal) return { error: mal };

  const supabase = await createClient();
  const { error } = await supabase.from("productos").insert({
    nombre: datos.nombre.trim(),
    precio: datos.precio,
    categoria: datos.categoria,
    caja: datos.caja,
    stock: datos.stock,
    contar_en_turno: datos.contar_en_turno,
  });
  // El nombre es unique: el choque es lo único que se puede tocar sin querer.
  if (error) {
    return { error: error.code === "23505" ? "Ya hay un producto con ese nombre." : error.message };
  }
  refrescar();
  return {};
}

export async function editarProducto(
  id: string,
  datos: DatosProducto & { activo: boolean },
): Promise<{ error?: string }> {
  const mal = valido(datos);
  if (mal) return { error: mal };

  const supabase = await createClient();
  const { error } = await supabase
    .from("productos")
    .update({
      nombre: datos.nombre.trim(),
      precio: datos.precio,
      categoria: datos.categoria,
      caja: datos.caja,
      stock: datos.stock,
      activo: datos.activo,
      contar_en_turno: datos.contar_en_turno,
    })
    .eq("id", id);
  if (error) {
    return { error: error.code === "23505" ? "Ya hay un producto con ese nombre." : error.message };
  }
  refrescar();
  return {};
}

/** Reposición: suma a lo que hay. Negativo para corregir de menos. */
export async function reponerStock(id: string, cantidad: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("sumar_stock", {
    p_producto_id: id,
    p_cantidad: cantidad,
  });
  if (error) return { error: error.message };
  refrescar();
  return {};
}
