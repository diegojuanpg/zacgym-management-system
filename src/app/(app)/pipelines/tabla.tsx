"use client";

import * as React from "react";
import { PIPELINES, ESTADOS, estadoDe, type Corrida, type Estado } from "@/lib/pipelines";
import { Buscador } from "@/components/buscador";
import { TabsUrl } from "@/components/tabs-url";
import { FiltroColumna } from "@/components/filtro-columna";
import { MostrarMas } from "@/components/mostrar-mas";
import { recortar } from "@/lib/recorte";
import { rangoDe } from "@/lib/filtros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTimeCard } from "@/components/ui/relative-time-card";
import { LogsIcon, XIcon } from "@/components/icons";
import { comoObjeto, useNavegacion, useParametros } from "@/hooks/use-navegacion";
import { cn } from "@/lib/utils";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableColgroup,
  TableCol,
} from "@/components/ui/table";

/** Cuántas líneas de log trae la página cuando no se pidió una corrida. */
export const TOPE_LINEAS = 2000;

const ZONA = "America/Argentina/Buenos_Aires";

export interface Linea {
  id: number;
  run_id: string | null;
  pipeline: string | null;
  nivel: string | null;
  alumno_id: string | null;
  gmail: string | null;
  mensaje: string | null;
  contexto: unknown;
  created_at: string;
}

const NIVELES = [
  { valor: "error", nombre: "Errores", color: "red-subtle" },
  { valor: "warn", nombre: "Avisos", color: "amber-subtle" },
  { valor: "info", nombre: "Info", color: "gray-subtle" },
] as const;

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/** Fuera del render: Date.now() no es puro. */
function haceCuanto(iso: string, ahora: number) {
  const minutos = Math.floor((ahora - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "Recién";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "Ayer" : `Hace ${dias} días`;
}

/** Cuánto tardó la corrida. Menos de un minuto se lee mejor en segundos. */
function duracion(inicio: string, fin: string) {
  const seg = Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 1000);
  if (seg < 60) return `${seg}s`;
  return `${Math.floor(seg / 60)}m ${seg % 60}s`;
}

const contextoCorto = (contexto: unknown) =>
  contexto === null || contexto === undefined ? "" : JSON.stringify(contexto);

/** La pantalla: arriba cómo está cada pipeline, abajo la consola de logs. */
export function TablaPipelines({
  ultimas,
  lineas: todas,
  run,
}: {
  ultimas: Corrida[];
  lineas: Linea[];
  run: string | undefined;
}) {
  const parametros = useParametros();
  const { irA } = useNavegacion();
  const params = comoObjeto(parametros);
  const busqueda = (parametros.get("q") ?? "").trim().toLowerCase();
  const solapa = parametros.get("nivel") ?? "todos";
  const filas = parametros.get("filas") ?? undefined;
  const filtroPipeline = parametros.getAll("pipeline");
  const rangoFecha = rangoDe(parametros.get("fecha") ?? undefined);
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });

  // El reloj se toma una vez por render y no en cada fila: si cada llamada
  // trajera su propio Date.now(), dos filas de la misma corrida podrían decir
  // cosas distintas. Se refresca cada minuto para que "hace 3 min" no quede
  // clavado en una pantalla que nadie toca.
  const [ahora, setAhora] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const porNombre = new Map(ultimas.map((u) => [u.pipeline, u]));
  const estados = PIPELINES.map((p) => {
    const ultima = porNombre.get(p.nombre);
    return { p, ultima, estado: estadoDe(p, ultima, ahora) };
  });

  function verCorrida(runId: string | null) {
    if (!runId) return;
    const nuevos = new URLSearchParams(parametros.toString());
    // Volver a hacer click en la corrida que ya se está viendo la saca: es la
    // forma de volver a todas sin ir a buscar el botón de arriba.
    if (nuevos.get("run") === runId) nuevos.delete("run");
    else nuevos.set("run", runId);
    nuevos.delete("filas");
    irA(nuevos);
  }

  function salirDeLaCorrida() {
    const nuevos = new URLSearchParams(parametros.toString());
    nuevos.delete("run");
    irA(nuevos);
  }

  const cuentaNivel = (nivel: string) => todas.filter((l) => l.nivel === nivel).length;
  const vistas = [
    { valor: "todos", nombre: "Todos", cuantos: todas.length },
    ...NIVELES.map((n) => ({
      valor: n.valor,
      nombre: n.nombre,
      cuantos: cuentaNivel(n.valor),
      ...(n.valor === "error" ? { atencion: cuentaNivel("error") } : {}),
    })),
  ];
  const vistaActual = vistas.find((v) => v.valor === solapa) ?? vistas[0];

  const opcionesPipeline = [...new Set(todas.map((l) => l.pipeline ?? "—"))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

  const lista = todas.filter(
    (l) =>
      (vistaActual.valor === "todos" || l.nivel === vistaActual.valor) &&
      (filtroPipeline.length === 0 || filtroPipeline.includes(l.pipeline ?? "—")) &&
      (rangoFecha.desde === "" || diaDe(l.created_at) >= rangoFecha.desde) &&
      (rangoFecha.hasta === "" || diaDe(l.created_at) <= rangoFecha.hasta) &&
      (busqueda === "" ||
        (l.mensaje ?? "").toLowerCase().includes(busqueda) ||
        (l.gmail ?? "").toLowerCase().includes(busqueda) ||
        (l.alumno_id ?? "").toLowerCase().includes(busqueda) ||
        contextoCorto(l.contexto).toLowerCase().includes(busqueda)),
  );

  // Igual que en el resto de la app: se recorta lo que se dibuja, no lo que se
  // cuenta. Las solapas y las opciones del filtro siguen mirando todo.
  const { tope, visibles } = recortar(lista, filas);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h1 className="text-heading-20">Pipelines</h1>

      {/* Cómo está cada uno. Es una tabla y no siete tarjetas: lo que se compara
          de un vistazo —cuándo corrió cada uno— tiene que quedar en columna. */}
      <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
        <TableRoot>
          <Table aria-label="Estado de los pipelines">
            <TableColgroup>
              <TableCol style={{ width: "18%" }} />
              <TableCol style={{ width: "12%" }} />
              <TableCol style={{ width: "15%" }} />
              <TableCol style={{ width: "9%" }} />
              <TableCol style={{ width: "14%" }} />
              <TableCol style={{ width: "32%" }} />
            </TableColgroup>
            <TableHeader className="[&_th]:font-bold">
              <TableRow>
                <TableHead>Pipeline</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Última corrida</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead>Corre</TableHead>
                <TableHead>Qué hace</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody striped>
              {estados.map(({ p, ultima, estado }) => (
                <TableRow
                  key={p.nombre}
                  onClick={() => verCorrida(ultima?.run_id ?? null)}
                  className={cn(
                    ultima && "cursor-pointer",
                    ultima && run === ultima.run_id && "!bg-[var(--ds-blue-100)]",
                  )}
                >
                  <TableCell className="font-mono text-[var(--ds-gray-1000)]">{p.nombre}</TableCell>
                  <TableCell>
                    <Insignia estado={estado} />
                  </TableCell>
                  <TableCell>
                    {ultima ? (
                      <>
                        <RelativeTimeCard date={ultima.fin} side="top">
                          <span className="text-[var(--ds-gray-1000)]">{cuando(ultima.fin)}</span>
                        </RelativeTimeCard>
                        <div className="text-copy-13 text-[var(--ds-gray-900)]">
                          {haceCuanto(ultima.fin, ahora)}
                          {ultima.errores > 0 && ` · ${ultima.errores} errores`}
                          {ultima.errores === 0 && ultima.avisos > 0 && ` · ${ultima.avisos} avisos`}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Nunca</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-[var(--ds-gray-900)]">
                    {ultima ? duracion(ultima.inicio, ultima.fin) : "—"}
                  </TableCell>
                  <TableCell className="text-[var(--ds-gray-900)]">{p.cuando}</TableCell>
                  <TableCell className="whitespace-normal text-[var(--ds-gray-900)]">
                    {p.que}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsUrl param="nivel" valor={vistaActual.valor} vistas={vistas} />
        </div>
        <Buscador inicial={busqueda} placeholder="Buscar en el mensaje o el alumno" />
      </div>

      {run && (
        <div className="flex items-center gap-2 text-copy-14">
          <span className="text-muted-foreground">Viendo una corrida sola:</span>
          <Badge variant="gray-subtle" size="sm" className="font-mono">
            {run.slice(0, 8)}
          </Badge>
          <Button variant="tertiary" size="sm" onClick={salirDeLaCorrida}>
            <XIcon className="size-3" />
            Ver todas
          </Button>
        </div>
      )}

      {todas.length === 0 ? (
        <EmptyState
          icon={<LogsIcon />}
          title="No hay logs"
          description="Los pipelines escriben acá cada vez que corren. Si está vacío es que todavía no corrió ninguno, o que dejaron de escribir."
        />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<LogsIcon />}
          title="Ninguna línea coincide"
          description="Probá con otro pipeline o borrá lo que escribiste en el buscador."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
          <TableRoot className="md:max-h-[calc(100vh-20rem)]">
            <Table aria-label="Logs de los pipelines">
              <TableColgroup>
                <TableCol style={{ width: "13%" }} />
                <TableCol style={{ width: "16%" }} />
                <TableCol style={{ width: "8%" }} />
                <TableCol style={{ width: "55%" }} />
                <TableCol style={{ width: "8%" }} />
              </TableColgroup>
              <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                <TableRow>
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Fecha y hora"
                      rango={{ param: "fecha", tipo: "date" }}
                    />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Pipeline" param="pipeline" opciones={opcionesPipeline} />
                  </TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead>Mensaje</TableHead>
                  <TableHead className="text-center">Corrida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody striped>
                {visibles.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <RelativeTimeCard date={l.created_at} side="top">
                        <span className="text-[var(--ds-gray-1000)]">{cuando(l.created_at)}</span>
                      </RelativeTimeCard>
                    </TableCell>
                    <TableCell className="font-mono text-[var(--ds-gray-1000)]">
                      {l.pipeline ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={NIVELES.find((n) => n.valor === l.nivel)?.color ?? "gray-subtle"}
                        size="sm"
                      >
                        {l.nivel ?? "—"}
                      </Badge>
                    </TableCell>
                    {/* El contexto es el jsonb que deja el pipeline: de qué
                        alumno, de qué archivo. Sin él un "No se pudo guardar"
                        no dice de quién. */}
                    <TableCell className="whitespace-normal text-[var(--ds-gray-1000)]">
                      {l.mensaje ?? "—"}
                      {(l.gmail || l.alumno_id || contextoCorto(l.contexto)) && (
                        <div className="break-all font-mono text-copy-13 text-[var(--ds-gray-900)]">
                          {[l.gmail, l.alumno_id, contextoCorto(l.contexto)]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="tertiary"
                        size="sm"
                        className="font-mono"
                        onClick={() => verCorrida(l.run_id)}
                        disabled={!l.run_id}
                      >
                        {l.run_id ? l.run_id.slice(0, 6) : "—"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <MostrarMas
                  ruta="/pipelines"
                  params={params}
                  tope={tope}
                  enPagina={visibles.length}
                  total={lista.length}
                  columnas={5}
                />
              </TableBody>
            </Table>
          </TableRoot>
        </div>
      )}
    </div>
  );
}

function Insignia({ estado }: { estado: Estado }) {
  const { nombre, color } = ESTADOS[estado];
  return (
    <Badge variant={`${color}-subtle`} size="sm">
      {nombre}
    </Badge>
  );
}
