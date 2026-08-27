"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { lunes, masDias } from "@/lib/filtros";
import { capitalizar, cn, hoyEnBsAs } from "@/lib/utils";
import { corta, filasDe, semanasDe, type DiaDeIngresos } from "@/lib/ingresos";

// Un color por rubro, por orden alfabético. Son las familias de Geist a la misma
// altura, que es lo que las hace distinguibles entre sí: mezclar pasos (700 con
// 900) da dos azules que en una barra apilada parecen el mismo.
// ponytail: si algún día hay más de ocho rubros el color se repite, y agregar
// una categoría corre los colores de las que van después. Un color fijo por
// categoría es una columna en `productos`, no un array acá.
const PALETA = [
  "var(--ds-blue-700)",
  "var(--ds-green-700)",
  "var(--ds-amber-700)",
  "var(--ds-purple-700)",
  "var(--ds-teal-700)",
  "var(--ds-pink-700)",
  "var(--ds-red-700)",
  "var(--ds-gray-700)",
];

/** Los dos rubros que no son una categoría del catálogo se nombran como en la tabla. */
const nombreRubro = (rubro: string) =>
  rubro === "cobro" ? "Cobro de deuda" : rubro === "sin" ? "Sin categoría" : capitalizar(rubro);

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

/** El eje no tiene lugar para los miles: $40.000 entra como $40k. */
const pesosCortos = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);

/**
 * Cuánta plata entró, apilada por rubro, en tres escalas.
 *
 * Por mes recorre los doce de un año, por semana las últimas N y por día una
 * semana de lunes a domingo. Los tres salen de la misma lista de días que baja
 * la página —una fila por día y rubro, unos cientos al año— así que cambiar de
 * escala o de año no vuelve al server.
 *
 * Los cubos vacíos entran igual: si se dibujaran solo los que tienen plata, un
 * enero cerrado desaparecería del año en vez de mostrarse en cero.
 *
 * El gráfico no mira los filtros de la tabla: tiene su propio período, y la
 * referencia de abajo prende y apaga rubros sin tocar la URL.
 */
export function BarrasIngresos({ ingresos }: { ingresos: DiaDeIngresos[] }) {
  const hoy = hoyEnBsAs();
  const [modo, setModo] = React.useState("mes");
  const [anio, setAnio] = React.useState(() => hoy.slice(0, 4));
  const [cuantas, setCuantas] = React.useState("12");
  const [semana, setSemana] = React.useState(() => lunes(hoy));
  const [apagados, setApagados] = React.useState<ReadonlySet<string>>(new Set());

  // Los rubros son los que aparecen en los datos, no una lista fija: una
  // categoría nueva del catálogo entra sola, y una que nunca vendió no ocupa
  // un color ni un renglón de la referencia.
  const rubros = React.useMemo(
    () => [...new Set(ingresos.map((i) => i.rubro))].sort((a, b) => a.localeCompare(b, "es")),
    [ingresos],
  );
  const encendidos = rubros.filter((r) => !apagados.has(r));

  const anios = React.useMemo(() => {
    const vistos = [...new Set(ingresos.map((i) => i.dia.slice(0, 4)))].sort().reverse();
    return vistos.length > 0 ? vistos : [hoy.slice(0, 4)];
  }, [ingresos, hoy]);

  const semanas = React.useMemo(() => semanasDe(ingresos, hoy), [ingresos, hoy]);

  // Los datos arrancan el día del primer ingreso: no se puede ir más atrás.
  const primerLunes = semanas[0] ?? lunes(hoy);

  const datos = React.useMemo(
    () => filasDe(ingresos, { modo, anio, cuantas, semanas, semana }),
    [ingresos, modo, anio, cuantas, semanas, semana],
  );

  // El total es el de lo que se está viendo: cambia con la escala, con el año y
  // con cada rubro que se apaga. Es la pregunta que el gráfico contesta de un
  // vistazo y que sumar barras a ojo no contesta.
  const total = datos.reduce(
    (suma, fila) => suma + encendidos.reduce((t, r) => t + Number(fila[r] ?? 0), 0),
    0,
  );

  const colorDe = (rubro: string) => PALETA[rubros.indexOf(rubro) % PALETA.length];
  const config: ChartConfig = Object.fromEntries(
    rubros.map((r) => [r, { label: nombreRubro(r), color: colorDe(r) }]),
  );

  const alternar = (rubro: string) =>
    setApagados((previos) => {
      const nuevos = new Set(previos);
      if (!nuevos.delete(rubro)) nuevos.add(rubro);
      return nuevos;
    });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* El control de arriba a la derecha cambia con la escala —año, cuántas
          semanas, o flechas para moverse de semana— y vive acá y no pegado al
          gráfico, para no meterse entre el título y las barras. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-heading-16">
          Ingresos<span className="text-[var(--ds-gray-900)]">/</span>
          {pesos(total)}
        </h2>

        {modo === "mes" ? (
          <Select
            aria-label="Año"
            size="small"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        ) : modo === "semana" ? (
          <Select
            aria-label="Cuántas semanas"
            size="small"
            value={cuantas}
            onChange={(e) => setCuantas(e.target.value)}
          >
            <option value="4">Últimas 4</option>
            <option value="8">Últimas 8</option>
            <option value="12">Últimas 12</option>
            <option value="todas">Todas</option>
          </Select>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="tertiary"
              size="icon-sm"
              aria-label="Semana anterior"
              disabled={semana <= primerLunes}
              onClick={() => setSemana((s) => masDias(s, -7))}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="text-copy-13 tabular-nums whitespace-nowrap text-muted-foreground">
              {corta(semana)} al {corta(masDias(semana, 6))}
            </span>
            <Button
              variant="tertiary"
              size="icon-sm"
              aria-label="Semana siguiente"
              disabled={semana >= lunes(hoy)}
              onClick={() => setSemana((s) => masDias(s, 7))}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <Tabs value={modo} onValueChange={setModo}>
        <TabsList>
          <TabsTrigger value="mes">Por mes</TabsTrigger>
          <TabsTrigger value="semana">Por semana</TabsTrigger>
          <TabsTrigger value="dia">Por día</TabsTrigger>
        </TabsList>
      </Tabs>

      <ChartContainer config={config} className="aspect-auto h-56 w-full min-w-64">
        <BarChart data={datos} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          {/* Solo las horizontales: las verticales no ayudan a comparar alturas. */}
          <CartesianGrid vertical={false} stroke="var(--ds-gray-alpha-400)" />
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tickMargin={8} />
          {/* El eje de plata sí va: en una barra apilada la altura de un tramo no
              se lee sola, hace falta contra qué medirla. */}
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={pesosCortos} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(valor, nombre, _item, _indice, fila) => {
                  // La parte se calcula sobre los rubros encendidos, que es lo
                  // que se está viendo: si Mensualidad está apagada, el 100% es
                  // lo que quedó, no el mes entero.
                  const dela = fila as unknown as Record<string, number> | undefined;
                  const suma = encendidos.reduce((t, r) => t + Number(dela?.[r] ?? 0), 0);
                  const parte = suma > 0 ? Math.round((Number(valor) / suma) * 100) : 0;
                  return (
                    <div className="flex w-full items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: colorDe(String(nombre)) }}
                      />
                      <span className="flex-1 text-muted-foreground">
                        {nombreRubro(String(nombre))}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{parte}%</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {pesos(Number(valor))}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          {/* Un tramo por rubro encendido. El redondeo va solo en el último, que
              es el que queda arriba de la pila. */}
          {encendidos.map((rubro, i) => (
            <Bar
              key={rubro}
              dataKey={rubro}
              stackId="ingresos"
              fill={colorDe(rubro)}
              radius={i === encendidos.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>

      {/* La referencia es el control, así que tiene que parecer uno: cada rubro
          es un botón del sistema, con borde mientras está prendido. Antes eran
          nombres sueltos con un punto al lado y nadie adivinaba que se clickean.

          Apagar el rubro grande es lo que hace legibles a los chicos: sale del
          apilado, y el eje se reescala solo a lo que queda. */}
      <div className="flex flex-wrap gap-1.5">
        {rubros.map((rubro) => {
          const apagado = apagados.has(rubro);
          return (
            <Button
              key={rubro}
              variant={apagado ? "tertiary" : "secondary"}
              size="xs"
              aria-pressed={!apagado}
              onClick={() => alternar(rubro)}
              title={apagado ? "Sumar al gráfico" : "Sacar del gráfico"}
              prefix={
                <span
                  aria-hidden
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: apagado ? "var(--ds-gray-500)" : colorDe(rubro) }}
                />
              }
            >
              <span className={cn(apagado && "text-muted-foreground line-through")}>
                {nombreRubro(rubro)}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
