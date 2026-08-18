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
