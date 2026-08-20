/** Plata en efectivo, separada por cajón. */
export interface PorCaja {
  grande: number;
  chica: number;
}

interface PagoEfectivo {
  metodo: string;
  caja: "grande" | "chica";
  monto: number;
}

interface MovimientoEfectivo {
  metodo: string;
  caja: "grande" | "chica";
  delta: number;
  anulado_en: string | null;
}

const vacio = (): PorCaja => ({ grande: 0, chica: 0 });

/**
 * Todo lo que pasó por los cajones en un día, separado igual que en el turno:
 * lo que entró por ventas y cobros de un lado, lo que se movió a mano del otro.
 *
 * Las transferencias no cuentan: nunca tocaron el cajón. Es la misma cuenta que
 * hace la vista `turno_actual` para el turno abierto, así que el total del día y
 * el del turno no se pueden contradecir.
 */
export function efectivoDelDia(pagos: PagoEfectivo[], movimientos: MovimientoEfectivo[]) {
  const ventas = vacio();
  const movidos = vacio();
  for (const p of pagos) {
    if (p.metodo === "efectivo") ventas[p.caja] += p.monto;
  }
  for (const m of movimientos) {
    if (m.metodo === "efectivo" && m.anulado_en === null) movidos[m.caja] += m.delta;
  }
  return { ventas, movimientos: movidos };
}

interface TurnoConCaja {
  id: string;
  abierto_en: string;
  caja_grande_inicial: number;
  caja_chica_inicial: number;
  caja_grande_final: number | null;
  caja_chica_final: number | null;
}

/**
 * Cuánto más (o menos) declaró cada turno al abrir de lo que el anterior contó
 * al cerrar: plata que se movió del cajón sin que nadie la anotara.
 *
 * Solo entre turnos del mismo día. De un día para el otro la recaudación a veces
 * se levanta y no siempre queda cargada como egreso, así que comparar contra el
 * cierre de ayer marcaría un salto casi todas las mañanas. El primero del día no
 * tiene contra qué compararse, y el que sigue a un turno que nadie cerró tampoco.
 */
export function saltosEntreTurnos(turnos: TurnoConCaja[]): Map<string, PorCaja> {
  const enOrden = [...turnos].sort((a, b) => a.abierto_en.localeCompare(b.abierto_en));
  const saltos = new Map<string, PorCaja>();

  for (let i = 1; i < enOrden.length; i++) {
    const previo = enOrden[i - 1];
    const turno = enOrden[i];
    if (previo.caja_grande_final === null || previo.caja_chica_final === null) continue;

    const salto = {
      grande: turno.caja_grande_inicial - previo.caja_grande_final,
      chica: turno.caja_chica_inicial - previo.caja_chica_final,
    };
    if (salto.grande !== 0 || salto.chica !== 0) saltos.set(turno.id, salto);
  }

  return saltos;
}
