"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { PERIODOS, SERIES, serie, type DiaRubro, type Modo } from "@/lib/grafico";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

/** El eje no entra en pesos enteros: $1.250.000 se come media pantalla. */
const corto = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1).replace(",0", "").replace(".0", "")}M`
    : n >= 1_000
      ? `$${Math.round(n / 1000)}k`
      : `$${n}`;

/**
 * Plata cobrada en el tiempo. Vive fuera de los filtros de la tabla a propósito:
 * es la foto del negocio, no del listado que se esté mirando abajo.
 */
export function GraficoVentas({ filas, hoy }: { filas: DiaRubro[]; hoy: string }) {
  const [modo, setModo] = React.useState<Modo>("dia");
  // Cada modo recuerda su período: volver de semanas a días no tiene por qué
  // devolverte a un período que no elegiste.
  const [periodos, setPeriodos] = React.useState({ dia: "31", semana: "3m" });
  const [apagadas, setApagadas] = React.useState<string[]>([]);

  const periodo = periodos[modo];
  const puntos = React.useMemo(() => serie(filas, modo, periodo, hoy), [filas, modo, periodo, hoy]);
  const visibles = SERIES.filter((s) => !apagadas.includes(s.valor));

  const total = puntos.reduce(
    (suma, p) => suma + visibles.reduce((sub, s) => sub + Number(p[s.valor] ?? 0), 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-[var(--ds-background-100)] p-4 shadow-[var(--ds-shadow-border)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            variant="secondary"
            className="w-auto [&_button]:h-8 [&_button]:px-3"
            selected={modo}
            setSelected={(elegido) => setModo(elegido as Modo)}
            tabs={[
              { value: "dia", title: "Por día" },
              { value: "semana", title: "Por semana" },
            ]}
          />
          <Select
            size="small"
            aria-label="Período del gráfico"
            value={periodo}
            onChange={(e) => setPeriodos({ ...periodos, [modo]: e.target.value })}
          >
            {PERIODOS[modo].map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </div>

        <p className="text-copy-13 text-[var(--ds-gray-900)]">
          <span className="text-[var(--ds-gray-1000)]">{pesos(total)}</span> cobrados
        </p>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={puntos} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.valor} id={`relleno-${s.valor}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid vertical={false} stroke="var(--ds-gray-alpha-400)" strokeDasharray="3 3" />
          <XAxis
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={28}
            tick={{ fill: "var(--ds-gray-900)", fontSize: 12 }}
          />
          <YAxis
            width={52}
            tickLine={false}
            axisLine={false}
            tickFormatter={corto}
            tick={{ fill: "var(--ds-gray-900)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: "var(--ds-gray-alpha-600)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="material-menu min-w-40 rounded-lg p-2.5">
                  <p className="text-label-13 mb-1.5 text-[var(--ds-gray-1000)]">{label}</p>
                  {payload.map((p) => (
                    <p
                      key={String(p.dataKey)}
                      className="text-copy-13 flex items-center justify-between gap-4 text-[var(--ds-gray-900)]"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: p.color }}
                          aria-hidden
                        />
                        {p.name}
                      </span>
                      <span className="text-[var(--ds-gray-1000)]">{pesos(Number(p.value ?? 0))}</span>
                    </p>
                  ))}
                </div>
              );
            }}
          />

          {visibles.map((s) => (
            <Area
              key={s.valor}
              type="natural"
              dataKey={s.valor}
              name={s.nombre}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#relleno-${s.valor})`}
              // Un punto solo (semana actual) no dibuja línea: sin esto no se ve nada.
              dot={puntos.length === 1}
              activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap items-center gap-1">
        {SERIES.map((s) => {
          const activa = !apagadas.includes(s.valor);
          return (
            <button
              key={s.valor}
              type="button"
              aria-pressed={activa}
              onClick={() =>
                setApagadas((previas) =>
                  activa ? [...previas, s.valor] : previas.filter((v) => v !== s.valor),
                )
              }
              className={cn(
                "text-copy-13 flex h-7 items-center gap-1.5 rounded-full px-2.5 transition-colors",
                activa
                  ? "text-[var(--ds-gray-1000)] hover:bg-[var(--ds-gray-alpha-100)]"
                  : "text-[var(--ds-gray-700)] hover:bg-[var(--ds-gray-alpha-100)]",
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: activa ? s.color : "var(--ds-gray-alpha-500)" }}
                aria-hidden
              />
              {s.nombre}
            </button>
          );
        })}
      </div>
    </div>
  );
}
