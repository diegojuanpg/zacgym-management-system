/**
 * Lo que comparten el formulario y las acciones de rutinas.
 *
 * Va aparte de `rutinas.ts` porque ese archivo es `"use server"` y de ahí solo
 * pueden salir funciones async: una constante exportada rompe el build.
 */

/**
 * Hasta acá llega un lote.
 *
 * Cada planilla tarda unos segundos y Apps Script corta a los cinco minutos.
 * Diez entran con aire. El mismo tope lo valida `Api.gs`, que es el que manda:
 * el de acá es para no mandar un pedido que ya se sabe que va a volver.
 */
export const MAX_LOTE = 10;

/**
 * Cuántos van en cada pedido.
 *
 * El lote entero no puede salir de una: la server action corre en la función
 * de `/mostrador`, que tiene sesenta segundos —el techo del plan—, y diez
 * planillas a varios segundos cada una no entran. Así que el formulario manda
 * de a cinco y espera cada tanda antes de la siguiente.
 *
 * En serie y no en paralelo a propósito: del otro lado hay un solo proyecto de
 * Apps Script con sus cuotas, y dos ejecuciones a la vez sobre las mismas
 * planillas es pedirle problemas.
 */
export const TANDA = 5;

/** A qué lunes queda fechada la rutina. */
export type Semana = "actual" | "proxima";

/** Cómo le fue a cada alumno del lote. */
export interface Resultado {
  id: string;
  quien: string;
  ok: boolean;
  /** Qué se hizo, cuando salió bien. */
  detalle?: string;
  /** Por qué no se pudo, cuando salió mal. */
  error?: string;
}
