import type { KeyboardEvent } from "react";

/**
 * Navegación con teclado dentro de un formulario del mostrador.
 *
 * La carga es repetitiva —alumno, producto, cantidad, método, monto, añadir— y
 * se hace mirando al alumno, no a la pantalla. Enter pasa al campo siguiente y
 * el último paso es el botón de añadir: así entra una venta entera sin tocar el
 * mouse ni el Tab.
 */

/** Los pasos de la carga. Los botones que no son el de añadir quedan afuera a
 *  propósito: "Editar categorías" o el limpiar del combo no son un campo. */
const CAMPOS = 'input:not([type="hidden"]), select, textarea, button[type="submit"]';

const camposDe = (form: HTMLFormElement) =>
  [...form.querySelectorAll<HTMLElement>(CAMPOS)].filter((el) => !el.matches(":disabled"));

/** Pasa al campo siguiente. Sin formulario alrededor no hace nada: el mismo
 *  combo se usa en filtros, donde robar el foco sería un estorbo. */
export function enfocarSiguiente(desde: HTMLElement | null) {
  const form = desde?.closest("form");
  if (!form || !desde) return;
  const campos = camposDe(form);
  campos[campos.indexOf(desde) + 1]?.focus();
}

/** Después de añadir una línea, vuelve al primer campo que quedó vacío para
 *  arrancar la siguiente. En movimientos de caja el tipo y la caja quedan
 *  pegados, así que el primer vacío es el motivo y no el principio del form. */
export function enfocarPrimero(form: HTMLFormElement) {
  // Después del repintado: los campos recién quedan vacíos cuando React aplica
  // el reset, no cuando se llama al setState.
  setTimeout(() => {
    const campos = camposDe(form);
    const vacio = campos.find((el) => el instanceof HTMLInputElement && el.value === "");
    (vacio ?? campos[0])?.focus();
  }, 0);
}

/**
 * Enter avanza en vez de mandar el formulario. Solo manda cuando el foco ya
 * llegó al botón de añadir, que es el último paso.
 *
 * Se saltea lo que ya manejó otro: el combo hace su propio Enter para elegir la
 * opción marcada, y avanza solo desde ahí.
 */
export function enterAvanza(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter" || e.defaultPrevented) return;
  const el = e.target as HTMLElement;
  if (el instanceof HTMLTextAreaElement || el.closest("button")) return;
  e.preventDefault();
  enfocarSiguiente(el);
}
