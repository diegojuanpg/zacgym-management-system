import { Card } from "@/components/ui/card";
import { Description } from "@/components/ui/description";

const pesos = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;
const conSigno = (n: number) => (n === 0 ? "—" : `${n > 0 ? "+" : "−"}${pesos(n)}`);

/** De dónde sale lo que tiene que haber en el cajón. */
interface Desglose {
  inicial: number;
  ventas: number;
  movimientos: number;
  esperado: number;
}

/** Turno abierto: el desglose es el del turno. */
export interface CajaEnCurso extends Desglose {
  estado: "abierto";
}

/** De qué es la cuenta: de un turno solo o del día entero. */
export type Alcance = "turno" | "dia";

/** Día terminado: el mismo desglose pero del día entero, contra lo que contaron. */
export interface CajaCerrada extends Desglose {
  estado: "cerrado";
  /** null cuando el último turno se autocerró a la medianoche: nadie contó. */
  contado: number | null;
}

export type EstadoCaja = CajaEnCurso | CajaCerrada | { estado: "sin_datos" };

/**
 * El efectivo de un cajón, con dos caras según el día que se esté mirando.
 *
 * Con el turno abierto muestra lo que tiene que haber ahora y de dónde sale: el
 * saldo con el que se abrió, lo que entró por ventas y cobros, y lo que
 * movieron los movimientos de caja. Sin eso, un faltante no se puede rastrear
 * sin abrir la tabla.
 *
 * En un día que ya cerró es la misma cuenta pero del día entero, arrancando de
 * lo que declaró el primer turno: a la plata que se entregó a la mañana se le
 * suma todo lo que pasó por el cajón y tiene que dar lo que contaron al final.
 * Ahí el número grande pasa a ser lo contado, no lo esperado.
 *
 * Las transferencias no cuentan en ninguno de los dos: nunca pasaron por el cajón.
 */
export function CajaCard({
  etiqueta,
  caja,
  alcance = "dia",
}: {
  etiqueta: string;
  caja: EstadoCaja;
  /** Cambia de qué habla el primer renglón: del turno o del día. */
  alcance?: Alcance;
}) {
  if (caja.estado === "sin_datos") {
    return (
      <Card padded={false} className="overflow-hidden">
        <div className="p-5">
          <Description
            title={etiqueta}
            content={<span className="text-heading-32 tabular-nums">—</span>}
          />
        </div>
      </Card>
    );
  }

  // Sin conteo final el número grande es lo esperado: es lo único que se sabe.
  const contado = caja.estado === "cerrado" ? caja.contado : null;
  const monto = contado ?? caja.esperado;
  const diferencia = contado === null ? 0 : contado - caja.esperado;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5">
        <Description
          title={etiqueta}
          content={<span className="text-heading-32 tabular-nums">{pesos(monto)}</span>}
        />
        {caja.estado === "cerrado" && (
          <p
            className={`text-copy-13 mt-1 ${
              contado === null ? "text-[var(--ds-amber-900)]" : "text-[var(--ds-gray-900)]"
            }`}
          >
            {contado === null ? "Nadie cerró la caja" : "Contado al cierre"}
          </p>
        )}
      </div>

      <dl className="text-copy-13 m-0 flex flex-col gap-2 border-t border-[var(--ds-gray-alpha-400)] p-4">
        <Renglon
          etiqueta={
            caja.estado === "abierto"
              ? "Abriste con"
              : alcance === "turno"
                ? "Se arrancó el turno con"
                : "Se arrancó el día con"
          }
          valor={pesos(caja.inicial)}
        />
        <Renglon etiqueta="Ventas y cobros" valor={conSigno(caja.ventas)} />
        <Renglon etiqueta="Extracciones y depósitos" valor={conSigno(caja.movimientos)} />
        {contado !== null && (
          <>
            <Renglon etiqueta="El sistema esperaba" valor={pesos(caja.esperado)} />
            <Renglon
              etiqueta="Diferencia"
              valor={diferencia === 0 ? "Cuadró" : conSigno(diferencia)}
              tono={diferencia === 0 ? "ok" : diferencia < 0 ? "malo" : "raro"}
            />
          </>
        )}
      </dl>
    </Card>
  );
}

const TONO = {
  normal: "text-[var(--ds-gray-1000)]",
  ok: "text-[var(--ds-green-900)]",
  // Que sobre no es tan grave como que falte, pero tampoco esta bien.
  raro: "text-[var(--ds-amber-900)]",
  malo: "text-[var(--ds-red-900)]",
};

function Renglon({
  etiqueta,
  valor,
  tono = "normal",
}: {
  etiqueta: string;
  valor: string;
  tono?: keyof typeof TONO;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--ds-gray-900)]">{etiqueta}</dt>
      <dd className={`m-0 tabular-nums ${TONO[tono]}`}>{valor}</dd>
    </div>
  );
}
