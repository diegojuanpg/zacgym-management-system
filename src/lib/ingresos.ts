/**
 * El agrupado del gráfico de Ventas: pasar una fila por día y rubro a una fila
 * por barra. Vive acá y no en el componente porque es la parte que se puede
 * equivocar sola —un mes corrido, una semana de más— y así se puede probar.
 */
import { lunes, masDias } from "./filtros.ts";

export interface DiaDeIngresos {
  /** "YYYY-MM-DD", ya resuelto en hora Argentina por la vista. */
  dia: string;
  /** La categoría del producto, "cobro" si saldó una compra de otro día, "sin" si no tiene. */
  rubro: string;
  monto: number;
}

/** Una fila del gráfico: la etiqueta del eje y un monto por rubro. */
export type Fila = { etiqueta: string } & Record<string, string | number>;

export const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
export const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * Suma los montos en cubos, según la clave que le toque a cada día.
 * `null` descarta el día: es cómo se recorta un año.
 */
function agrupar(ingresos: DiaDeIngresos[], claveDe: (dia: string) => string | null) {
  const cubos = new Map<string, Record<string, number>>();
  for (const i of ingresos) {
    const clave = claveDe(i.dia);
    if (clave === null) continue;
    const cubo = cubos.get(clave) ?? {};
    cubo[i.rubro] = (cubo[i.rubro] ?? 0) + i.monto;
    cubos.set(clave, cubo);
  }
  return cubos;
}

/**
 * Todas las semanas entre la primera con datos y la de hoy, sin saltearse las
 * vacías: son las que el desplegable recorta a las últimas N. Una semana sin
 * plata es un dato —el gimnasio cerró— y salteársela la haría desaparecer.
 */
export function semanasDe(ingresos: DiaDeIngresos[], hoy: string) {
  if (ingresos.length === 0) return [];
  const primero = lunes(ingresos.reduce((min, i) => (i.dia < min ? i.dia : min), ingresos[0].dia));
  const ultimo = lunes(hoy);
  const todas: string[] = [];
  for (let l = primero; l <= ultimo; l = masDias(l, 7)) todas.push(l);
  return todas;
}

/** "2026-08-24" -> "24/8". La etiqueta del eje, que tiene poco lugar. */
export const corta = (dia: string) => `${Number(dia.slice(8))}/${Number(dia.slice(5, 7))}`;

/**
 * Las barras de una escala. Los cubos vacíos entran igual: si se dibujaran solo
 * los que tienen plata, un enero cerrado desaparecería del año en vez de
 * mostrarse en cero.
 */
export function filasDe(
  ingresos: DiaDeIngresos[],
  opciones: {
    modo: string;
    /** Modo mes: "2026". */
    anio: string;
    /** Modo semana: cuántas de las últimas, o "todas". */
    cuantas: string;
    /** Modo semana: la lista completa, que ya calculó `semanasDe`. */
    semanas: string[];
    /** Modo día: el lunes de la semana que se está mirando. */
    semana: string;
  },
): Fila[] {
  const { modo, anio, cuantas, semanas, semana } = opciones;

  if (modo === "mes") {
    const cubos = agrupar(ingresos, (d) => (d.startsWith(anio) ? d.slice(5, 7) : null));
    return MESES.map((nombre, i) => ({
      etiqueta: nombre,
      ...cubos.get(String(i + 1).padStart(2, "0")),
    }));
  }

  if (modo === "semana") {
    const cubos = agrupar(ingresos, (d) => lunes(d));
    const recorte = cuantas === "todas" ? semanas : semanas.slice(-Number(cuantas));
    return recorte.map((l) => ({ etiqueta: corta(l), ...cubos.get(l) }));
  }

  const cubos = agrupar(ingresos, (d) => d);
  return DIAS.map((nombre, i) => ({ etiqueta: nombre, ...cubos.get(masDias(semana, i)) }));
}
