import { Card } from "@/components/ui/card";
import { Description } from "@/components/ui/description";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

/**
 * Cuánta plata movió una caja en el turno, partida en efectivo y transferencia.
 *
 * El efectivo es lo que tiene que haber en el cajón —incluye el saldo con el que
 * se abrió, por eso se aclara al lado del título—; la transferencia nunca pasó
 * por ahí, entró a la cuenta. Se suman igual porque la pregunta que contesta la
 * tarjeta es cuánto manejó la caja; para el arqueo está el cierre, que solo pide
 * el cajón.
 *
 * La proporción se dice con el porcentaje debajo de cada monto y no con una
 * barra de dos colores: dos colores nuevos piden una referencia que explique
 * cuál es cuál, y el número ya lo dice sin agregar nada.
 */
export function CajaCard({
  etiqueta,
  inicial,
  efectivo,
  transferencia,
  abierto,
}: {
  etiqueta: string;
  inicial: number;
  efectivo: number;
  transferencia: number;
  /** Sin turno no hay nada que contar: la tarjeta queda en guiones. */
  abierto: boolean;
}) {
  const total = efectivo + transferencia;
  const parte = (monto: number) =>
    total === 0 ? null : `${Math.round((monto / total) * 100)}% del total`;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 p-5">
        <Description
          title={etiqueta}
          content={
            <span className="text-heading-32 tabular-nums">{abierto ? pesos(total) : "—"}</span>
          }
        />
        {abierto && (
          <span className="text-copy-13 text-[var(--ds-gray-900)]">
            abrió en {pesos(inicial)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 border-t border-[var(--ds-gray-alpha-400)]">
        <Parte
          etiqueta="Efectivo"
          monto={efectivo}
          detalle={abierto ? parte(efectivo) : null}
          abierto={abierto}
          className="border-r border-[var(--ds-gray-alpha-400)]"
        />
        <Parte
          etiqueta="Transferencia"
          monto={transferencia}
          detalle={abierto ? parte(transferencia) : null}
          abierto={abierto}
        />
      </div>
    </Card>
  );
}

function Parte({
  etiqueta,
  monto,
  detalle,
  abierto,
  className,
}: {
  etiqueta: string;
  monto: number;
  detalle: string | null;
  abierto: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Description
        className="gap-1 p-4"
        title={etiqueta}
        content={
          <div className="flex flex-col gap-0.5">
            <span className="text-heading-16 tabular-nums">{abierto ? pesos(monto) : "—"}</span>
            {/* Alto reservado: que aparezca el porcentaje no debe mover la fila. */}
            <span className="text-copy-13 min-h-[18px] text-[var(--ds-gray-900)]">{detalle}</span>
          </div>
        }
      />
    </div>
  );
}
