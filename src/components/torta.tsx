/**
 * Anillo de porciones, con el total en el medio.
 *
 * Dibujado con un `stroke-dasharray` por porción sobre el mismo círculo: es la
 * forma más corta de hacer una torta en SVG y evita sumar una librería de
 * gráficos para una sola pantalla.
 *
 * Las porciones se separan con 2px del color del fondo, así dos rojos vecinos
 * no se leen como una sola mancha. La que venga marcada como `trama` se dibuja
 * además con rayas diagonales: es la señal que sobrevive a un daltonismo, a una
 * impresión en blanco y negro y al modo de alto contraste.
 */
export interface Porcion {
  nombre: string;
  cuantos: number;
  /** Color de la porción. Va como `var(--ds-*)`, no un hex suelto. */
  color: string;
  /** Rayada, para la porción que hay que distinguir sin depender del color. */
  trama?: boolean;
}

const RADIO = 60;
const GROSOR = 22;
const VUELTA = 2 * Math.PI * RADIO;
/** Separación entre porciones, en unidades del viewBox. */
const SEPARACION = 3;

export function Torta({
  porciones,
  titulo,
  etiquetaTotal,
}: {
  porciones: Porcion[];
  titulo: string;
  etiquetaTotal: string;
}) {
  const visibles = porciones.filter((p) => p.cuantos > 0);
  const total = visibles.reduce((suma, p) => suma + p.cuantos, 0);

  const vuelta = (p: Porcion) => (p.cuantos / total) * VUELTA;
  // Cada arco arranca donde terminan los anteriores. Se suma de nuevo en cada
  // vuelta en vez de acarrear un acumulador: son cinco porciones, y una variable
  // que se pisa a si misma adentro del render es justo lo que React no quiere.
  const arcos = visibles.map((p, i) => ({
    ...p,
    largo: Math.max(vuelta(p) - SEPARACION, 1),
    desde: visibles.slice(0, i).reduce((suma, previa) => suma + vuelta(previa), 0),
  }));

  return (
    <div className="flex items-center gap-5">
      <svg
        viewBox="0 0 160 160"
        className="size-36 shrink-0"
        role="img"
        aria-label={`${titulo}: ${etiquetaTotal}`}
      >
        <defs>
          <pattern id="torta-trama" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="var(--ds-red-900)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ds-background-100)" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Una sola porción no dibuja arcos: el anillo entero es esa porción. */}
        {arcos.length === 1 && (
          <circle
            cx="80"
            cy="80"
            r={RADIO}
            fill="none"
            stroke={arcos[0].trama ? "url(#torta-trama)" : arcos[0].color}
            strokeWidth={GROSOR}
          />
        )}

        {arcos.length > 1 &&
          arcos.map((a) => (
            <circle
              key={a.nombre}
              cx="80"
              cy="80"
              r={RADIO}
              fill="none"
              stroke={a.trama ? "url(#torta-trama)" : a.color}
              strokeWidth={GROSOR}
              strokeDasharray={`${a.largo} ${VUELTA - a.largo}`}
              strokeDashoffset={-a.desde}
              transform="rotate(-90 80 80)"
            >
              <title>{`${a.nombre}: ${a.cuantos}`}</title>
            </circle>
          ))}

        {/* El total va adentro del agujero: es el número que da sentido al resto. */}
        <text
          x="80"
          y="76"
          textAnchor="middle"
          className="fill-foreground text-heading-24"
          style={{ fontSize: 26 }}
        >
          {total}
        </text>
        <text
          x="80"
          y="94"
          textAnchor="middle"
          className="fill-[var(--ds-gray-900)]"
          style={{ fontSize: 11 }}
        >
          {etiquetaTotal}
        </text>
      </svg>

      {/* La referencia lleva el número al lado del nombre: el color solo dice
          cuál es cuál, nunca cuántos son. */}
      <ul className="flex min-w-0 flex-col gap-1.5">
        {visibles.map((p) => (
          <li key={p.nombre} className="flex items-center gap-2 text-copy-13">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
            <span className="tabular-nums">{p.cuantos}</span>
            <span className="truncate text-muted-foreground">{p.nombre}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
