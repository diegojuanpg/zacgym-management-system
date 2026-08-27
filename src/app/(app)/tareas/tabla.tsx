"use client";

import Link from "next/link";
import { ESTADOS, type EstadoTarea } from "@/lib/tarea-estados";
import type { Categoria } from "@/lib/tareas";
import { EstadoTareaSelect } from "@/components/tareas/estado-tarea";
import { CategoriaTareaSelect } from "@/components/tareas/categoria-tarea";
import { DetalleTareaEditable } from "@/components/tareas/detalle-tarea";
import { Buscador } from "@/components/buscador";
import { TabsUrl } from "@/components/tabs-url";
import { FiltroColumna } from "@/components/filtro-columna";
import { MostrarMas } from "@/components/mostrar-mas";
import { recortar } from "@/lib/recorte";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTimeCard } from "@/components/ui/relative-time-card";
import { ClipboardIcon } from "@/components/icons";
import { rangoDe } from "@/lib/filtros";
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

import { comoObjeto, useParametros } from "@/hooks/use-navegacion";
import { borrarLaTarea } from "@/lib/borrados";
const ZONA = "America/Argentina/Buenos_Aires";

/** Sin categoría no es un valor de la base: es no tener ninguna. */
const SIN_CATEGORIA = "Sin categoría";

/** Las tareas viejas se cargaron antes de que el alta pidiera quién las anota. */
const SIN_ANOTAR = "Sin registrar";

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Fuera del render: Date.now() no es puro. */
function haceCuanto(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 30) return `Hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `Hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

export interface Tarea {
  id: string;
  alumno_id: string;
  alumno: string;
  categoria_id: string | null;
  categoria: string | null;
  detalle: string;
  creado_en: string;
  estado: EstadoTarea;
  /** El empleado que la anotó. Null en las cargadas antes de que se pidiera. */
  anoto: string | null;
}

/** La tabla de tareas: solapas por estado, buscador, filtros y filas editables. */
export function TablaTareas({
  tareas: todas,
  categorias,
}: {
  tareas: Tarea[];
  categorias: Categoria[];
}) {
  const parametros = useParametros();
  const params = comoObjeto(parametros);
  const busqueda = (parametros.get("q") ?? "").trim().toLowerCase();
  const solapa = parametros.get("tab") ?? "todas";
  const criterio = parametros.get("orden") ?? "reciente";
  const filas = parametros.get("filas") ?? undefined;
  const lista_ = (nombre: string) => parametros.getAll(nombre);

  const categoriaDe = (t: Tarea) => t.categoria ?? SIN_CATEGORIA;
  const anotoDe = (t: Tarea) => t.anoto ?? SIN_ANOTAR;

  const vistas = [
    { valor: "todas", nombre: "Todas", cuantos: todas.length },
    {
      valor: "pendiente",
      nombre: "Pendiente",
      cuantos: todas.filter((t) => t.estado === "pendiente").length,
    },
    {
      valor: "en_proceso",
      nombre: "En proceso",
      cuantos: todas.filter((t) => t.estado === "en_proceso").length,
    },
    {
      valor: "terminada",
      nombre: "Terminada",
      cuantos: todas.filter((t) => t.estado === "terminada").length,
    },
  ];
  const vistaActual = vistas.find((v) => v.valor === solapa) ?? vistas[0];

  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesAlumno = ordenar(todas.map((t) => t.alumno));
  const opcionesCategoria = ordenar([...categorias.map((c) => c.nombre), ...todas.map(categoriaDe)]);
  const filtroAlumno = lista_("alumno");
  const opcionesAnoto = ordenar(todas.map(anotoDe));
  const filtroCategoria = lista_("categoria");
  const filtroAnoto = lista_("anoto");
  const nombreEstado = (e: EstadoTarea) => ESTADOS.find((x) => x.valor === e)!.nombre;
  const filtroEstado = lista_("estado");
  // El mismo rango de fechas que en Ventas. creado_en es un instante: se pasa a
  // dia de Buenos Aires antes de comparar, o la tarea de las 21 cae en el
  // siguiente.
  const rangoCreada = rangoDe(parametros.get("creada") ?? undefined);
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });

  const lista = todas
    .filter(
      (t) =>
        (vistaActual.valor === "todas" || t.estado === vistaActual.valor) &&
        (filtroCategoria.length === 0 || filtroCategoria.includes(categoriaDe(t))) &&
        (filtroAlumno.length === 0 || filtroAlumno.includes(t.alumno)) &&
        (filtroAnoto.length === 0 || filtroAnoto.includes(anotoDe(t))) &&
        (filtroEstado.length === 0 || filtroEstado.includes(nombreEstado(t.estado))) &&
        (rangoCreada.desde === "" || diaDe(t.creado_en) >= rangoCreada.desde) &&
        (rangoCreada.hasta === "" || diaDe(t.creado_en) <= rangoCreada.hasta) &&
        (busqueda === "" ||
          t.alumno.toLowerCase().includes(busqueda) ||
          t.detalle.toLowerCase().includes(busqueda) ||
          (t.categoria ?? "").toLowerCase().includes(busqueda) ||
          (t.anoto ?? "").toLowerCase().includes(busqueda)),
    )
    .sort((a, b) =>
      criterio === "antigua"
        ? a.creado_en.localeCompare(b.creado_en)
        : b.creado_en.localeCompare(a.creado_en),
    );

  // Igual que en Alumnos: la cuenta de las solapas y las opciones de los
  // filtros salen de la lista entera, solo se recorta lo que se dibuja.
  const { tope, visibles } = recortar(lista, filas);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-heading-20">Tareas</h1>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsUrl param="tab" valor={vistaActual.valor} vistas={vistas} />
        </div>
        <Buscador inicial={busqueda} placeholder="Buscar por alumno o texto" />
      </div>

      {todas.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon />}
          title="No hay tareas cargadas"
          description="Se cargan desde Acciones, en el mostrador: a quién, de qué categoría y qué hay que hacer. Acá quedan hasta que las borres."
        />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon />}
          title="Ninguna tarea coincide"
          description="Probá con otra categoría o borrá lo que escribiste en el buscador."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
          <TableRoot className="md:max-h-[calc(100vh-16rem)]">
            <Table aria-label="Tareas">
              <TableColgroup>
                <TableCol style={{ width: "13%" }} />
                <TableCol style={{ width: "11%" }} />
                <TableCol style={{ width: "12%" }} />
                <TableCol style={{ width: "15%" }} />
                <TableCol style={{ width: "29%" }} />
                <TableCol style={{ width: "13%" }} />
                <TableCol style={{ width: "7%" }} />
              </TableColgroup>
              <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                <TableRow>
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Fecha y hora"
                      rango={{ param: "creada", tipo: "date" }}
                      orden={{
                        param: "orden",
                        opciones: [
                          { valor: "reciente", label: "Más nuevas" },
                          { valor: "antigua", label: "Más viejas" },
                        ],
                      }}
                    />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Anotó" param="anoto" opciones={opcionesAnoto} />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Categoría"
                      param="categoria"
                      opciones={opcionesCategoria}
                    />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Alumno" param="alumno" opciones={opcionesAlumno} />
                  </TableHead>
                  <TableHead>Tarea</TableHead>
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Estado"
                      param="estado"
                      opciones={ESTADOS.map((e) => e.nombre)}
                    />
                  </TableHead>
                  <TableHead className="text-center" />
                </TableRow>
              </TableHeader>
              <TableBody striped>
                {visibles.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <RelativeTimeCard date={t.creado_en} side="top">
                        <span className="text-[var(--ds-gray-1000)]">{cuando(t.creado_en)}</span>
                      </RelativeTimeCard>
                      <div className="text-copy-13 text-[var(--ds-gray-900)]">
                        {haceCuanto(t.creado_en)}
                      </div>
                    </TableCell>
                    <TableCell
                      className={t.anoto === null ? "text-muted-foreground" : undefined}
                    >
                      {t.anoto ?? SIN_ANOTAR}
                    </TableCell>
                    <TableCell>
                      <CategoriaTareaSelect
                        id={t.id}
                        categoriaId={t.categoria_id}
                        categoriaNombre={t.categoria}
                        categorias={categorias}
                      />
                    </TableCell>
                    <TableCell className="text-[var(--ds-gray-1000)]">
                      <Link href={`/alumnos/${t.alumno_id}`} className="hover:underline">
                        {t.alumno}
                      </Link>
                    </TableCell>
                    {/* La tarea es editable directamente en la celda. */}
                    <TableCell className="whitespace-normal text-[var(--ds-gray-1000)]">
                      <DetalleTareaEditable id={t.id} detalle={t.detalle} />
                    </TableCell>
                    <TableCell>
                      <EstadoTareaSelect id={t.id} estado={t.estado} />
                    </TableCell>
                    <TableCell className="text-center">
                      <form action={borrarLaTarea}>
                        <input type="hidden" name="id" value={t.id} />
                        <Button
                          type="submit"
                          variant="tertiary"
                          size="sm"
                          aria-label={`Eliminar la tarea de ${t.alumno} cargada el ${cuando(t.creado_en)}`}
                          className="hover:bg-[var(--ds-red-200)] hover:text-[var(--ds-red-900)]"
                        >
                          Eliminar
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
                <MostrarMas
                  ruta="/tareas"
                  params={params}
                  tope={tope}
                  enPagina={visibles.length}
                  total={lista.length}
                  columnas={7}
                />
              </TableBody>
            </Table>
          </TableRoot>

        </div>
      )}
    </div>
  );
}
