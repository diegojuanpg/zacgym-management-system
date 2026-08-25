"use server";

import { borrarVenta, borrarMovimiento, borrarPago } from "@/lib/ventas";
import { borrarTarea } from "@/lib/tareas";

/**
 * Los borrados de las tablas, como server actions sueltas.
 *
 * Viven acá y no adentro de cada página porque las tablas son componentes de
 * cliente, que no pueden declarar sus propias server actions.
 */
export async function borrar(formData: FormData) {
  await borrarVenta(String(formData.get("id")));
}

/** Un cobro puede haberse repartido en varios pagos: se van todos juntos. */
export async function borrarCobro(formData: FormData) {
  for (const id of String(formData.get("id")).split(",")) await borrarPago(id);
}

export async function borrarMov(formData: FormData) {
  await borrarMovimiento(String(formData.get("id")));
}

export async function borrarLaTarea(formData: FormData) {
  await borrarTarea(String(formData.get("id")));
}
