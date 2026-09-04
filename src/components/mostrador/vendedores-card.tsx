import { Card } from "@/components/ui/card";
import { Description } from "@/components/ui/description";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

export interface DeudaVendedor {
  nombre: string;
  monto: number;
}

/**
 * Lo que hay que entregarle a cada dueño de mercadería.
 *
 * Hay productos que no son del GYM: alguien los deja, el mostrador los
 * cobra y después le pasa la plata. Eso se marca en el producto y acá se suma
 * lo que se cobró de los suyos.
 *
 * Cuenta lo cobrado, no lo vendido: si el alumno se lo llevó fiado, la plata
 * todavía no entró y no hay nada que entregar. Entran las dos formas de pago,
 * porque la deuda con el vendedor existe igual haya caído en el cajón o en el
 * banco; el cajón lo controlan las tarjetas de caja, que son solo efectivo.
 */
export function VendedoresCard({
  deudas,
  alcance,
}: {
  deudas: DeudaVendedor[];
  /** De qué habla el total: del turno abierto o del día entero. */
  alcance: "turno" | "dia";
}) {
  const total = deudas.reduce((suma, d) => suma + d.monto, 0);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="p-5">
        <Description
          title="A entregar"
          content={<span className="text-heading-32 tabular-nums">{pesos(total)}</span>}
        />
        <p className="text-copy-13 mt-1 text-[var(--ds-gray-900)]">
          Cobrado {alcance === "turno" ? "en este turno" : "en el día"} de productos de
          terceros.
        </p>
        <dl className="mt-4 flex flex-col gap-1.5 border-t border-[var(--ds-gray-alpha-400)] pt-3">
          {deudas.map((d) => (
            <div key={d.nombre} className="text-copy-14 flex items-baseline justify-between gap-3">
              <dt className="truncate text-[var(--ds-gray-900)]">{d.nombre}</dt>
              <dd className="tabular-nums text-[var(--ds-gray-1000)]">{pesos(d.monto)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}
