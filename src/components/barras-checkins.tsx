"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
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

export interface DiaConCheckins {
  /** "YYYY-MM-DD", ya resuelto en hora Argentina por la vista. */
  dia: string;
  personas: number;
}

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const config = { personas: { label: "Personas", color: "var(--ds-blue-700)" } } satisfies ChartConfig;

/** "2026-08-24" -> "24/8". La etiqueta del eje, que tiene poco lugar. */
const corta = (dia: string) => `${Number(dia.slice(8))}/${Number(dia.slice(5, 7))}`;

/**
 * Cuánta gente entrenó, en dos modos.
 *
 * Por día recorre una semana de lunes a domingo, con flechas para ir hacia
 * atrás; por semana muestra el total de las últimas N. Los dos salen de la
 * misma lista de días que baja la página, así que cambiar de modo o de semana
 * no vuelve al server.
 *
 * Los días sin nadie entran igual con un cero: si se dibujaran solo los días
 * con gente, una semana con un feriado quedaría de seis barras y parecería
 * normal.
 */
export function BarrasCheckins({ dias, hoy }: { dias: DiaConCheckins[]; hoy: string }) {
  const [modo, setModo] = React.useState("dia");
  const [semana, setSemana] = React.useState(() => lunes(hoy));
  const [cuantas, setCuantas] = React.useState("12");

  const porDia = React.useMemo(
    () => new Map(dias.map((d) => [d.dia, d.personas])),
    [dias],
  );

  // Los datos arrancan el día del primer check-in: no se puede ir más atrás.
  const primerLunes = dias.length > 0 ? lunes(dias[0].dia) : lunes(hoy);

  const datosDia = DIAS.map((nombre, i) => {
    const dia = masDias(semana, i);
    return { etiqueta: nombre, dia, personas: porDia.get(dia) ?? 0 };
  });

  const datosSemana = React.useMemo(() => {
    const totales = new Map<string, number>();
    for (const d of dias) {
      const l = lunes(d.dia);
      totales.set(l, (totales.get(l) ?? 0) + d.personas);
    }
    const todas = [...totales.entries()].sort(([a], [b]) => a.localeCompare(b));
    const recorte = cuantas === "todas" ? todas : todas.slice(-Number(cuantas));
    return recorte.map(([l, personas]) => ({ etiqueta: corta(l), dia: l, personas }));
  }, [dias, cuantas]);

  const datos = modo === "dia" ? datosDia : datosSemana;
  const total = datos.reduce((suma, d) => suma + d.personas, 0);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={modo} onValueChange={setModo}>
          <TabsList>
            <TabsTrigger value="dia">Por día</TabsTrigger>
            <TabsTrigger value="semana">Por semana</TabsTrigger>
          </TabsList>
        </Tabs>

        {modo === "dia" ? (
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
        ) : (
          <Select
            aria-label="Cuántas semanas"
            value={cuantas}
            onChange={(e) => setCuantas(e.target.value)}
          >
            <option value="4">Últimas 4</option>
            <option value="8">Últimas 8</option>
            <option value="12">Últimas 12</option>
            <option value="todas">Todas</option>
          </Select>
        )}
      </div>

      <ChartContainer config={config} className="aspect-auto h-36 w-full min-w-64">
        <BarChart data={datos} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          {/* Solo las horizontales: las verticales no ayudan a comparar alturas. */}
          <CartesianGrid vertical={false} stroke="var(--ds-gray-alpha-400)" />
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent nameKey="personas" hideLabel={false} />}
          />
          <Bar
            dataKey="personas"
            fill="var(--ds-blue-700)"
            radius={4}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>

      <p className="text-copy-13 text-muted-foreground">
        {modo === "dia"
          ? `${total} entrenamientos esa semana`
          : `${total} en ${datos.length} semanas`}
      </p>
    </div>
  );
}
