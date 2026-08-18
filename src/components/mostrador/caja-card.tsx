import { Card } from "@/components/ui/card";
import { Description } from "@/components/ui/description";

const pesos = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;
const conSigno = (n: number) => (n === 0 ? "—" : `${n > 0 ? "+" : "−"}${pesos(n)}`);

/**
 * Lo que tiene que haber en un cajón ahora mismo, en efectivo.
 *
 * Es el mismo número que el cierre le va a pedir al que cuente, así que abajo
 * queda de dónde sale: el saldo con el que se abrió, lo que entró en efectivo
 * por ventas y cobros, y lo que movieron los movimientos de caja. Sin eso, un
 * faltante no se puede rastrear sin abrir la tabla.
 *
 * Las transferencias no cuentan: nunca pasaron por el cajón.
 */
export function CajaCard({
  etiqueta,
  inicial,
  ventas,
  movimientos,
  esperado,
  abierto,
}: {
  etiqueta: string;
  inicial: number;
  ventas: number;
  movimientos: number;
  esperado: number;
  /** Sin turno no hay nada que contar: la tarjeta queda en guiones. */
  abierto: boolean;
}) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5">
        <Description
          title={etiqueta}
          content={
            <span className="text-heading-32 tabular-nums">{abierto ? pesos(esperado) : "—"}</span>
          }
        />
      </div>

      {abierto && (
        <dl className="text-copy-13 m-0 flex flex-col gap-2 border-t border-[var(--ds-gray-alpha-400)] p-4">
          <Renglon etiqueta="Abrió con" valor={pesos(inicial)} />
          <Renglon etiqueta="Ventas y cobros" valor={conSigno(ventas)} />
          <Renglon etiqueta="Movimientos" valor={conSigno(movimientos)} />
        </dl>
      )}
    </Card>
  );
}

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--ds-gray-900)]">{etiqueta}</dt>
      <dd className="m-0 tabular-nums text-[var(--ds-gray-1000)]">{valor}</dd>
    </div>
  );
}
