"use client";

import { Label, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * Anillo de porciones con el total en el medio, sobre el chart de shadcn.
 *
 * Es el "Pie Chart - Donut with Text" de la galería, vestido con Geist: los
 * colores llegan como `var(--ds-*)`, el tooltip usa `material-menu` y la
 * referencia va al costado con las utilidades de texto del sistema, en vez del
 * pie centrado que trae el bloque.
 *
 * La porción marcada como `trama` se pinta además con rayas diagonales: dos
 * pasos del mismo rojo no se distinguen —lo mide el validador de paletas— y la
 * trama es la señal que sobrevive a un daltonismo, a una impresión en blanco y
 * negro y al modo de alto contraste.
 */
export interface Porcion {
  nombre: string;
  cuantos: number;
  /** Color de la porción. Va como `var(--ds-*)`, no un hex suelto. */
  color: string;
  /** Rayada, para la porción que hay que distinguir sin depender del color. */
  trama?: boolean;
}

export function Torta({
  porciones,
  etiquetaTotal,
}: {
  porciones: Porcion[];
  etiquetaTotal: string;
}) {
  const visibles = porciones.filter((p) => p.cuantos > 0);
  const total = visibles.reduce((suma, p) => suma + p.cuantos, 0);

  // Recharts pinta cada porción con el `fill` de su dato. La clave del config
  // es el nombre, que es también lo que muestra el tooltip.
  const datos = visibles.map((p) => ({
    nombre: p.nombre,
    cuantos: p.cuantos,
    fill: p.trama ? "url(#torta-trama)" : p.color,
  }));
  const config: ChartConfig = Object.fromEntries(
    visibles.map((p) => [p.nombre, { label: p.nombre, color: p.color }]),
  );

  return (
    // Centrado y con el anillo a tamaño fijo. Atarlo a la altura de la fila
    // sonaba mejor, pero un cuadrado que saca su ancho de la altura le come el
    // lugar a la referencia y le corta los nombres: acá el ancho manda.
    <div className="flex h-full items-center justify-center gap-5">
      <ChartContainer config={config} className="aspect-square size-52 shrink-0">
        <PieChart>
          <defs>
            <pattern
              id="torta-trama"
              width="6"
              height="6"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="6" height="6" fill="var(--ds-red-900)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ds-background-100)" strokeWidth="2" />
            </pattern>
          </defs>

          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent nameKey="nombre" hideLabel />}
          />

          <Pie
            data={datos}
            dataKey="cuantos"
            nameKey="nombre"
            // En porcentaje y no en píxeles: el anillo se dibuja proporcional
            // al tamaño que le toque, que ahora depende de la altura de la fila.
            innerRadius="62%"
            outerRadius="96%"
            strokeWidth={2}
            // Sin animación de entrada: el anillo se redibuja cada vez que
            // cambia un filtro de la tabla, y verlo crecer de cero en cada
            // tecleada del buscador distrae más de lo que muestra.
            isAnimationActive={false}
            // El borde de cada porción es del color del fondo: separa dos rojos
            // vecinos sin agregar una línea de otro color.
            stroke="var(--ds-background-100)"
          >
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox)) return null;
                const { cx = 0, cy = 0 } = viewBox;
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={cx} y={cy} className="fill-foreground text-heading-24">
                      {total}
                    </tspan>
                    <tspan x={cx} y={cy + 18} className="fill-[var(--ds-gray-900)] text-copy-13">
                      {etiquetaTotal}
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      {/* La referencia lleva el número al lado del nombre: el color solo dice
          cuál es cuál, nunca cuántos son. */}
      {/* Sin truncado: los nombres son la mitad del gráfico. Si no entran, que
          crezca la tarjeta —mide lo que necesita— y no que se coman las letras. */}
      <ul className="flex shrink-0 flex-col gap-1.5">
        {visibles.map((p) => (
          <li key={p.nombre} className="flex items-center gap-2 text-copy-13">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
            <span className="tabular-nums">{p.cuantos}</span>
            <span className="whitespace-nowrap text-muted-foreground">{p.nombre}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
