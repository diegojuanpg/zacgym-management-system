/**
 * Armado de la serie del gráfico de Ventas. Vive aparte de la página porque es
 * lo único con lógica: fechas, huecos y semanas. Las fechas van en texto
 * `YYYY-MM-DD` y se recorren en UTC a propósito — la vista ya devuelve el día
 * calculado en hora argentina, y volver a pasarlo por un Date local lo corre.
 */

/** Un renglón de la vista `ventas_por_dia`. */
export interface DiaRubro {
  dia: string;
  rubro: string;
  monto: number;
}

export interface Punto {
  /** Inicio del bucket, `YYYY-MM-DD`. */
  fecha: string;
  etiqueta: string;
  [rubro: string]: string | number;
}

export type Modo = "dia" | "semana";

/** El orden manda el de la leyenda y el de las áreas apiladas. */
export const SERIES = [
  { valor: "mensualidad", nombre: "Mensualidades", color: "var(--ds-blue-700)" },
  { valor: "consumible", nombre: "Consumibles", color: "var(--ds-teal-700)" },
  { valor: "suplemento", nombre: "Suplementos", color: "var(--ds-purple-700)" },
  { valor: "sin", nombre: "Sin categoría", color: "var(--ds-gray-700)" },
  { valor: "cobro", nombre: "Cobros", color: "var(--ds-amber-700)" },
] as const;

export const PERIODOS = {
  dia: [
    { valor: "7", nombre: "Últimos 7 días", dias: 7 },
    { valor: "14", nombre: "Últimos 14 días", dias: 14 },
    { valor: "31", nombre: "Últimos 31 días", dias: 31 },
    { valor: "90", nombre: "Últimos 90 días", dias: 90 },
    { valor: "180", nombre: "Últimos 180 días", dias: 180 },
    { valor: "365", nombre: "Últimos 365 días", dias: 365 },
  ],
  semana: [
    { valor: "actual", nombre: "Semana actual", semanas: 1, atras: 0 },
    { valor: "pasada", nombre: "Semana pasada", semanas: 1, atras: 1 },
    { valor: "mes", nombre: "Último mes", semanas: 4, atras: 0 },
    { valor: "3m", nombre: "Últimos 3 meses", semanas: 13, atras: 0 },
    { valor: "6m", nombre: "Últimos 6 meses", semanas: 26, atras: 0 },
    { valor: "12m", nombre: "Últimos 12 meses", semanas: 52, atras: 0 },
  ],
} as const;

/** Cuántos días atrás mira el gráfico como máximo: lo que traiga la página. */
export const DIAS_MAXIMOS = 365 + 7;

export function sumarDias(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 domingo, 1 lunes... como `getUTCDay`. */
const diaSemana = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** La semana arranca el lunes: el domingo el gimnasio está cerrado. */
export const lunesDe = (iso: string) => sumarDias(iso, -((diaSemana(iso) + 6) % 7));

const etiquetaDe = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

/** Desde y hasta del período elegido, ambos inclusive. */
export function ventana(modo: Modo, periodo: string, hoy: string) {
  if (modo === "dia") {
    const elegido = PERIODOS.dia.find((p) => p.valor === periodo) ?? PERIODOS.dia[0];
    return { desde: sumarDias(hoy, -(elegido.dias - 1)), hasta: hoy };
  }
  const elegido = PERIODOS.semana.find((p) => p.valor === periodo) ?? PERIODOS.semana[0];
  const lunes = lunesDe(hoy);
  // "Semana pasada" es la única que no termina hoy: cierra el sábado anterior.
  if (elegido.atras > 0) {
    const arranque = sumarDias(lunes, -7 * elegido.atras);
    return { desde: arranque, hasta: sumarDias(arranque, 5) };
  }
  return { desde: sumarDias(lunes, -7 * (elegido.semanas - 1)), hasta: hoy };
}

/**
 * Filas sueltas a puntos del gráfico. Los días sin ventas van en cero (el hueco
 * dibuja una línea que miente sobre el día que falta) y los domingos no entran:
 * el gimnasio no abre, y un cero fijo cada siete días aplasta la curva.
 */
export function serie(filas: DiaRubro[], modo: Modo, periodo: string, hoy: string): Punto[] {
  const { desde, hasta } = ventana(modo, periodo, hoy);

  const porDia = new Map<string, Map<string, number>>();
  for (const f of filas) {
    if (f.dia < desde || f.dia > hasta || diaSemana(f.dia) === 0) continue;
    const clave = modo === "dia" ? f.dia : lunesDe(f.dia);
    const rubros = porDia.get(clave) ?? new Map<string, number>();
    rubros.set(f.rubro, (rubros.get(f.rubro) ?? 0) + f.monto);
    porDia.set(clave, rubros);
  }

  const puntos: Punto[] = [];
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
    if (diaSemana(dia) === 0) continue;
    const clave = modo === "dia" ? dia : lunesDe(dia);
    if (puntos.at(-1)?.fecha === clave) continue;

    const rubros = porDia.get(clave);
    const punto: Punto = { fecha: clave, etiqueta: etiquetaDe(clave) };
    for (const s of SERIES) punto[s.valor] = rubros?.get(s.valor) ?? 0;
    puntos.push(punto);
  }
  return puntos;
}
