import { Badge } from "@/components/ui/badge";

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
  cerrado_en: string | null;
  caja_grande_final: number | null;
  caja_chica_final: number | null;
  caja_grande_esperada: number | null;
  caja_chica_esperada: number | null;
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
 */
export function TurnoSeparador({ turno }: { turno: TurnoDelDia }) {
  const enCurso = turno.cerrado_en === null;
  const difGrande =
    turno.caja_grande_final === null || turno.caja_grande_esperada === null
      ? null
      : turno.caja_grande_final - turno.caja_grande_esperada;
  const difChica =
    turno.caja_chica_final === null || turno.caja_chica_esperada === null
      ? null
      : turno.caja_chica_final - turno.caja_chica_esperada;

  return (
    // Banda de fondo y no una linea: el separador tiene que leerse de un vistazo
    // entre dos tablas de numeros, y una linea mas ahi adentro no se ve.
    //
    // A la izquierda de que turno es, a la derecha como cerro. El horario queda
    // centrado contra el bloque de la derecha, que crece a dos renglones cuando
    // falta stock. En pantallas angostas el cierre baja en vez de apretarlo.
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-[var(--ds-gray-alpha-200)] px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-heading-16 text-[var(--ds-gray-1000)]">
          {hora(turno.abierto_en)} → {enCurso ? "en curso" : hora(turno.cerrado_en!)}
        </span>
        <span className="text-copy-13 text-[var(--ds-gray-900)]">
          {turno.responsables.length > 0 ? turno.responsables.join(", ") : "nadie fichó"}
        </span>
        {enCurso && <Badge variant="blue-subtle">En curso</Badge>}
      </div>

      {!enCurso && (
        <div className="text-copy-13 flex flex-col items-end gap-2.5">
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1">
            <Caja etiqueta="Grande" contado={turno.caja_grande_final} dif={difGrande} />
            <Caja etiqueta="Chica" contado={turno.caja_chica_final} dif={difChica} />
          </div>

          {/* El stock va en su propio renglon: son nombres de producto largos y
              en la misma linea que la plata empujaban todo. Sin la palabra
              "Stock" adelante: que falte un Monster ya se entiende solo. */}
          {turno.stock.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1">
              {turno.stock.map((d) => (
                <Badge
                  key={`${d.producto}-${d.momento}`}
                  variant={d.diferencia < 0 ? "red-subtle" : "amber-subtle"}
                >
                  {d.producto} {d.diferencia > 0 ? "+" : ""}
                  {d.diferencia}
                  {d.momento === "apertura" ? " (al abrir)" : ""}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lo que contaron en un cajón. El monto va siempre en blanco: es un dato, no un
 * veredicto. Lo que salta es la pastilla de al lado, que solo aparece cuando no
 * dio y dice cuánto.
 *
 * Sin conteo no se inventa un cero.
 */
function Caja({
  etiqueta,
  contado,
  dif,
}: {
  etiqueta: string;
  contado: number | null;
  dif: number | null;
}) {
  if (contado === null) return null;

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[var(--ds-gray-900)]">{etiqueta}</span>
      <span className="tabular-nums text-[var(--ds-gray-1000)]">{pesos(contado)}</span>
      {dif !== null && dif !== 0 && (
        <Badge variant={dif < 0 ? "red-subtle" : "amber-subtle"}>
          {dif < 0 ? "faltan" : "sobran"} {pesos(dif)}
        </Badge>
      )}
    </span>
  );
}
