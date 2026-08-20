import { Card } from "@/components/ui/card";
import { Description } from "@/components/ui/description";

const pesos = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;
const conSigno = (n: number) => (n === 0 ? "—" : `${n > 0 ? "+" : "−"}${pesos(n)}`);

/** Turno abierto: de dónde sale lo que tiene que haber en el cajón ahora. */
export interface CajaEnCurso {
  estado: "abierto";
  inicial: number;
  ventas: number;
  movimientos: number;
  esperado: number;
}

/** Día ya cerrado: lo que contaron y lo que el sistema esperaba. */
export interface CajaCerrada {
  estado: "cerrado";
  contado: number;
  esperado: number;
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
 * En un día que ya cerró la pregunta es otra: cuánto contaron y si dio. Ahí el
 * número grande pasa a ser lo contado, no lo esperado.
 *
 * Las transferencias no cuentan en ninguno de los dos: nunca pasaron por el cajón.
 */
export function CajaCard({ etiqueta, caja }: { etiqueta: string; caja: EstadoCaja }) {
  const monto =
    caja.estado === "abierto" ? caja.esperado : caja.estado === "cerrado" ? caja.contado : null;
  const diferencia = caja.estado === "cerrado" ? caja.contado - caja.esperado : 0;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5">
        <Description
          title={etiqueta}
          content={
            <span className="text-heading-32 tabular-nums">
              {monto === null ? "—" : pesos(monto)}
            </span>
          }
        />
        {caja.estado === "cerrado" && (
          <p className="text-copy-13 mt-1 text-[var(--ds-gray-900)]">Contado al cierre</p>
        )}
      </div>

      {caja.estado !== "sin_datos" && (
        <dl className="text-copy-13 m-0 flex flex-col gap-2 border-t border-[var(--ds-gray-alpha-400)] p-4">
          {caja.estado === "abierto" ? (
            <>
              <Renglon etiqueta="Abrió con" valor={pesos(caja.inicial)} />
              <Renglon etiqueta="Ventas y cobros" valor={conSigno(caja.ventas)} />
              <Renglon etiqueta="Movimientos" valor={conSigno(caja.movimientos)} />
            </>
          ) : (
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
      )}
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
