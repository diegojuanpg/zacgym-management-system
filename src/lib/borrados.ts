"use server";

import { borrarTarea } from "@/lib/tareas";

/**
 * El borrado de tareas, como server action suelta.
 *
 * Vive acá y no adentro de la página porque la tabla es un componente de
 * cliente, que no puede declarar sus propias server actions.
 *
 * Ventas, cobros y movimientos ya no pasan por acá: los borra `BotonBorrar`,
 * que además ofrece deshacer.
 */
export async function borrarLaTarea(formData: FormData) {
  await borrarTarea(String(formData.get("id")));
}
