import { Card } from "@/components/ui/card";
import { ArrowUpIcon } from "@/components/icons";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

/**
 * Cuánta plata movió una caja en el turno, partida en efectivo y transferencia.
 *
 * El efectivo es lo que tiene que haber en el cajón —incluye el saldo con el que
 * se abrió, por eso se aclara debajo del título—; la transferencia nunca pasó por
 * ahí, entró a la cuenta. Se suman igual porque la pregunta que contesta la
 * tarjeta es cuánto manejó la caja, no cuánto se cuenta al cerrar; para eso está
 * el número grande de efectivo y el cierre, que solo pide el cajón.
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
  // Sin plata la barra queda entera del color del efectivo en vez de partirse
  // en una división por cero.
  const parteEfectivo = total > 0 ? (efectivo / total) * 100 : 100;

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-label-13 flex items-center gap-1.5 text-[var(--ds-gray-900)] uppercase">
            <ArrowUpIcon className="size-3.5 rotate-45 text-[var(--ds-green-900)]" />
            {etiqueta}
          </span>
          {abierto && (
            <span className="text-copy-13 text-[var(--ds-gray-900)]">
              abrió en {pesos(inicial)}
            </span>
          )}
        </div>

        <span className="text-heading-32 tabular-nums text-[var(--ds-gray-1000)]">
          {abierto ? pesos(total) : "—"}
        </span>

        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <Parte etiqueta="Efectivo" monto={efectivo} color="green" abierto={abierto} />
          <Parte etiqueta="Transferencia" monto={transferencia} color="blue" abierto={abierto} />
        </div>

        <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--ds-gray-alpha-300)]">
          {abierto && (
            <>
              <div
                className="bg-[var(--ds-green-700)]"
                style={{ width: `${parteEfectivo}%` }}
                aria-hidden
              />
              <div className="flex-1 bg-[var(--ds-blue-700)]" aria-hidden />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function Parte({
  etiqueta,
  monto,
  color,
  abierto,
}: {
  etiqueta: string;
  monto: number;
  color: "green" | "blue";
  abierto: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label-12 flex items-center gap-1.5 text-[var(--ds-gray-900)] uppercase">
        <span
          className={`size-2 shrink-0 rounded-full ${
            color === "green" ? "bg-[var(--ds-green-700)]" : "bg-[var(--ds-blue-700)]"
          }`}
          aria-hidden
        />
        {etiqueta}
      </span>
      <span className="text-heading-16 tabular-nums text-[var(--ds-gray-1000)]">
        {abierto ? pesos(monto) : "—"}
      </span>
    </div>
  );
}
