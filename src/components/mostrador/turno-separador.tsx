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
  nota_cierre: string | null;
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
 * Es una línea de texto y no una tarjeta: la tabla ya tiene bastante peso
 * visual, y lo único que tiene que saltar acá es lo que no cuadró.
 */
export function TurnoSeparador({ turno, primero }: { turno: TurnoDelDia; primero: boolean }) {
  const enCurso = turno.cerrado_en === null;
  const dif = (final: number | null, esperada: number | null) =>
    final === null || esperada === null ? null : final - esperada;

  return (
    <div
      className={`text-copy-13 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pb-2 ${
        primero ? "pt-2" : "mt-1 border-t border-[var(--ds-gray-alpha-400)] pt-3"
      }`}
    >
      <span className="font-medium text-[var(--ds-gray-1000)] tabular-nums">
        {hora(turno.abierto_en)} → {enCurso ? "en curso" : hora(turno.cerrado_en!)}
      </span>
      <span className="text-[var(--ds-gray-900)]">
        {turno.responsables.length > 0 ? turno.responsables.join(", ") : "nadie fichó"}
      </span>

      {!enCurso && (
        <>
          <Caja
            etiqueta="Grande"
            contado={turno.caja_grande_final}
            dif={dif(turno.caja_grande_final, turno.caja_grande_esperada)}
          />
          <Caja
            etiqueta="Chica"
            contado={turno.caja_chica_final}
            dif={dif(turno.caja_chica_final, turno.caja_chica_esperada)}
          />

          {turno.stock.map((d) => (
            <span key={`${d.producto}-${d.momento}`} className="text-[var(--ds-red-900)]">
              <Punto />
              {d.producto} {d.diferencia > 0 ? "+" : "−"}
              {Math.abs(d.diferencia)}
              {d.momento === "apertura" ? " al abrir" : ""}
            </span>
          ))}

          {turno.nota_cierre && (
            <span className="text-[var(--ds-gray-900)] italic">
              <Punto />“{turno.nota_cierre}”
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** El separador entre datos sueltos de la misma línea. */
const Punto = () => <span className="mr-2 text-[var(--ds-gray-700)]">·</span>;

/** Lo que contaron en un cajón y si dio. Sin conteo no se inventa un cero. */
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
    <span className="text-[var(--ds-gray-900)]">
      <Punto />
      {etiqueta} <span className="tabular-nums">{pesos(contado)}</span>{" "}
      {dif === null || dif === 0 ? (
        "cuadró"
      ) : (
        // Lo unico que tiene color es lo que no cuadro.
        <span className={dif < 0 ? "text-[var(--ds-red-900)]" : "text-[var(--ds-amber-900)]"}>
          {dif < 0 ? "faltan" : "sobran"} {pesos(dif)}
        </span>
      )}
    </span>
  );
}
