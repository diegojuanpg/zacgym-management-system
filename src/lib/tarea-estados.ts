/**
 * En qué anda una tarea.
 *
 * Vive en su propio módulo, sin directiva, porque lo usan las dos orillas: la
 * página de tareas (server) y el selector (client). Exportado desde el archivo
 * "use client" del selector, la constante llega al server como una referencia
 * de cliente y `ESTADOS.map` explota; desde `lib/tareas.ts` tampoco se puede,
 * que es "use server" y solo deja exportar funciones async.
 */
export type EstadoTarea = "pendiente" | "en_proceso" | "terminada";

export const ESTADOS: { valor: EstadoTarea; nombre: string }[] = [
  { valor: "pendiente", nombre: "Pendiente" },
  { valor: "en_proceso", nombre: "En proceso" },
  { valor: "terminada", nombre: "Terminada" },
];
