import { Badge } from "@/components/ui/badge";
import { ChevronDownIcon } from "@/components/icons";
import type { PorCaja } from "@/lib/caja";

const ZONA = "America/Argentina/Buenos_Aires";
const pesos = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export interface DiferenciaProducto {
  producto: string;
  diferencia: number;
  momento: "apertura" | "cierre";
}

export interface TurnoDelDia {
  id: string;
  abierto_en: string;
  /** Solo los cerrados dibujan separador: el abierto no lleva cabecera. */
  cerrado_en: string;
  caja_grande_inicial: number;
  caja_chica_inicial: number;
  caja_grande_final: number | null;
  caja_chica_final: number | null;
  caja_grande_esperada: number | null;
  caja_chica_esperada: number | null;
  /** Lo que declaró al abrir de más o de menos contra el cierre del anterior. */
  salto: PorCaja | null;
  responsables: string[];
  stock: DiferenciaProducto[];
}

/**
 * La cabecera de cada bloque de movimientos: de qué turno son y cómo cerró.
 *
 * Va arriba del grupo y no entre grupos porque los movimientos bajan de más
 * nuevo a más viejo: el cierre es lo último que pasó en ese turno, así que
 * separarlo del bloque que describe lo dejaba a mitad de camino entre dos.
 *
 * El del turno siguiente entra al mostrador y lo primero que ve es si el
 * anterior dejó la caja o el stock descuadrado.
 *
 * Lo que no cuadra se dice al lado del monto, y el circulito de la derecha
 * cuenta cuántos problemas hay en total: de un vistazo se sabe si este turno
 * hay que mirarlo o no. El stock se despliega porque son nombres largos y en
 * la mayoría de los turnos no hay ninguno.
 */
export function TurnoSeparador({ turno }: { turno: TurnoDelDia }) {
  const difGrande =
    turno.caja_grande_final === null || turno.caja_grande_esperada === null
      ? null
      : turno.caja_grande_final - turno.caja_grande_esperada;
  const difChica =
    turno.caja_chica_final === null || turno.caja_chica_esperada === null
      ? null
      : turno.caja_chica_final - turno.caja_chica_esperada;

  // Sin ningún conteo final el turno no lo cerró una persona: lo cerró solo el
  // sistema a la medianoche. No es un problema del turno, así que no suma.
  const loCerroNadie = turno.caja_grande_final === null && turno.caja_chica_final === null;

  const alertas =
    (difGrande ? 1 : 0) +
    (difChica ? 1 : 0) +
    (turno.salto?.grande ? 1 : 0) +
    (turno.salto?.chica ? 1 : 0) +
    turno.stock.length;

  const cabecera = (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-heading-16 text-[var(--ds-gray-1000)]">
          {hora(turno.abierto_en)} → {hora(turno.cerrado_en)}
        </span>
        <span className="text-copy-13 text-[var(--ds-gray-900)]">
          {turno.responsables.length > 0 ? turno.responsables.join(", ") : "nadie fichó"}
        </span>
      </div>

      <div className="text-copy-13 flex flex-wrap items-center justify-end gap-x-5 gap-y-1">
        {loCerroNadie ? (
          <Badge variant="amber-subtle">No cerraron</Badge>
        ) : (
          <>
            <Caja
              etiqueta="Grande"
              inicial={turno.caja_grande_inicial}
              contado={turno.caja_grande_final}
              dif={difGrande}
              salto={turno.salto?.grande ?? 0}
            />
            <Caja
              etiqueta="Chica"
              inicial={turno.caja_chica_inicial}
              contado={turno.caja_chica_final}
              dif={difChica}
              salto={turno.salto?.chica ?? 0}
            />
          </>
        )}

        {/* Cuántas cosas salieron mal, sin abrir nada. Si no hay ninguna no se
            dibuja: un cero en un círculo rojo se lee como un problema. */}
        {alertas > 0 && (
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--ds-red-900)] text-[11px] font-medium tabular-nums text-white"
            aria-label={`${alertas} ${alertas === 1 ? "problema" : "problemas"} en este turno`}
          >
            {alertas}
          </span>
        )}

        {turno.stock.length > 0 && (
          <ChevronDownIcon
            aria-hidden
            className="size-4 shrink-0 text-[var(--ds-gray-900)] transition-transform group-open:rotate-180"
          />
        )}
      </div>
    </div>
  );

  // Sin diferencias de stock no hay nada que desplegar, así que tampoco flecha.
  // <details> y no estado de React: es una sola cosa que se abre y se cierra, y
  // así el separador sigue siendo server component y anda sin JS.
  if (turno.stock.length === 0) {
    return <div className="bg-[var(--ds-gray-alpha-200)]">{cabecera}</div>;
  }

  return (
    <details className="group bg-[var(--ds-gray-alpha-200)]">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {cabecera}
      </summary>
      <div className="flex flex-wrap items-center gap-1 px-4 pb-3">
        {turno.stock.map((d) => (
          <Badge
            key={`${d.producto}-${d.momento}`}
            variant={d.diferencia < 0 ? "red-subtle" : "amber-subtle"}
          >
            {d.diferencia < 0 ? "Falta" : "Sobra"} {Math.abs(d.diferencia)} {d.producto}
            {d.momento === "apertura" ? " (al abrir)" : ""}
          </Badge>
        ))}
      </div>
    </details>
  );
}

/**
 * El cajón de punta a punta: con cuánto abrió y con cuánto cerró, y al lado lo
 * que no cuadra.
 *
 * Los dos montos y no solo el del cierre: $215.000 no dice nada suelto, y
 * $130.000 → $215.000 dice cuánto entró en el turno sin hacer ninguna cuenta.
 *
 * Van en blanco: son datos. Lo que se pinta de rojo es el problema, y sobrar es
 * tan problema como faltar: los dos significan que la plata no es la que el
 * sistema puede explicar.
 *
 * Sin conteo no se inventa un cero.
 */
function Caja({
  etiqueta,
  inicial,
  contado,
  dif,
  salto,
}: {
  etiqueta: string;
  inicial: number;
  contado: number | null;
  dif: number | null;
  /** Lo que declaró al abrir de más o de menos contra el cierre del anterior. */
  salto: number;
}) {
  if (contado === null) return null;

  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <span className="text-[var(--ds-gray-900)]">{etiqueta}</span>
      {/* La misma flecha de texto que separa las horas del turno, dos renglones
          más arriba: un ícono acá al lado se leería como otra cosa. */}
      <span className="tabular-nums text-[var(--ds-gray-1000)]">
        {pesos(inicial)} → {pesos(contado)}
      </span>
      {dif !== null && dif !== 0 && (
        <span className="font-medium text-[var(--ds-red-900)]">
          {dif < 0 ? "Faltan" : "Sobran"} {pesos(dif)}
        </span>
      )}
      {salto !== 0 && (
        <span className="font-medium text-[var(--ds-red-900)]">
          Abrió con {pesos(salto)} de {salto < 0 ? "menos" : "más"}
        </span>
      )}
    </span>
  );
}
