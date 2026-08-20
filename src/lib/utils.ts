import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Una fecha sin hora ("2026-07-07") no tiene zona. Pasarla por Date la lee como
 * medianoche UTC y en Buenos Aires (UTC-3) cae el dia anterior: el vencimiento
 * del 7 se mostraba como 6. Se arma a mano con los pedazos del ISO.
 */
export function fechaCorta(iso: string, anio: "2-digit" | "numeric" = "numeric") {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${anio === "2-digit" ? a.slice(2) : a}`;
}

/**
 * Ahora, en el formato que pide <input type="datetime-local"> (sin zona, hora
 * local). El navegador del mostrador esta en Buenos Aires, asi que la hora que
 * ve el que carga y la que interpreta `new Date(valor)` son la misma.
 *
 * Fuera del render: Date no es puro.
 */
export function ahoraLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Hoy a las 00:00 en Buenos Aires, como instante ISO.
 *
 * No sirve `new Date()` a secas: el server corre en UTC, asi que entre las 21 y
 * las 24 de Buenos Aires ya es el dia siguiente para el. Se pregunta la fecha en
 * la zona y se le pega el offset, que en Argentina es fijo todo el año.
 */
export function inicioDelDia() {
  const hoy = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return `${hoy}T00:00:00-03:00`;
}

/** Hoy en Buenos Aires, como "YYYY-MM-DD". */
export function hoyEnBsAs() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

/**
 * Los dos extremos de un dia de Buenos Aires, como instantes ISO. Argentina no
 * cambia de hora, asi que el offset es fijo todo el año y no hay que calcularlo.
 */
export function rangoDelDia(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  const siguiente = new Date(Date.UTC(a, m - 1, d + 1));
  const manana = siguiente.toISOString().slice(0, 10);
  return { desde: `${dia}T00:00:00-03:00`, hasta: `${manana}T00:00:00-03:00` };
}
