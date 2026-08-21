import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { borrarTarea } from "@/lib/tareas";
import { ESTADOS, type EstadoTarea } from "@/lib/tarea-estados";
import { EstadoTareaSelect } from "@/components/tareas/estado-tarea";
import { Buscador } from "@/components/buscador";
import { TabsUrl } from "@/components/tabs-url";
import { FiltroColumna } from "@/components/filtro-columna";
import { MostrarMas, recortar } from "@/components/mostrar-mas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTimeCard } from "@/components/ui/relative-time-card";
import { ClipboardIcon } from "@/components/icons";
import { rangoDe } from "@/lib/filtros";
import { traerTodo } from "@/lib/traer-todo";
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

const ZONA = "America/Argentina/Buenos_Aires";

/** Sin categoría no es un valor de la base: es no tener ninguna. */
const SIN_CATEGORIA = "Sin categoría";

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

interface Tarea {
  id: string;
  alumno_id: string;
  alumno: string;
  categoria: string | null;
  detalle: string;
  creado_en: string;
  estado: EstadoTarea;
}

export default async function TareasPage({ searchParams }: PageProps<"/tareas">) {
  await requireStaff();
  const params = await searchParams;
  const { q, cat, alumno, orden, estado, creada, filas } = params;
  const busqueda = typeof q === "string" ? q.trim().toLowerCase() : "";
  const solapa = typeof cat === "string" ? cat : "todas";
  const criterio = typeof orden === "string" ? orden : "reciente";
  const lista_ = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  const supabase = await createClient();
  const [todas, { data: categorias }] = await Promise.all([
    traerTodo<Tarea>(
      supabase
        .from("tareas_detalle")
        .select("id, alumno_id, alumno, categoria, detalle, creado_en, estado")
        .order("creado_en", { ascending: false }),
    ),
    // Todas las categorías, incluso las que todavía no tiene ninguna tarea: la
    // solapa vacía dice que la categoría existe, que es distinto de no existir.
    supabase.from("tarea_categorias").select("nombre").order("nombre"),
  ]);

  const categoriaDe = (t: Tarea) => t.categoria ?? SIN_CATEGORIA;

  const nombres = [
    ...new Set([...(categorias ?? []).map((c) => c.nombre), ...todas.map(categoriaDe)]),
  ].sort((a, b) => a.localeCompare(b, "es"));

  const vistas = [
    { valor: "todas", nombre: "Todas", cuantos: todas.length },
    ...nombres.map((n) => ({
      valor: n,
      nombre: n,
      cuantos: todas.filter((t) => categoriaDe(t) === n).length,
    })),
  ];
  const vistaActual = vistas.find((v) => v.valor === solapa) ?? vistas[0];

  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesAlumno = ordenar(todas.map((t) => t.alumno));
  const filtroAlumno = lista_(alumno);
  const nombreEstado = (e: EstadoTarea) => ESTADOS.find((x) => x.valor === e)!.nombre;
  const filtroEstado = lista_(estado);
  // El mismo rango de fechas que en Ventas. creado_en es un instante: se pasa a
  // dia de Buenos Aires antes de comparar, o la tarea de las 21 cae en el
  // siguiente.
  const rangoCreada = rangoDe(creada);
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });

  const lista = todas
    .filter(
      (t) =>
        (vistaActual.valor === "todas" || categoriaDe(t) === vistaActual.valor) &&
        (filtroAlumno.length === 0 || filtroAlumno.includes(t.alumno)) &&
        (filtroEstado.length === 0 || filtroEstado.includes(nombreEstado(t.estado))) &&
        (rangoCreada.desde === "" || diaDe(t.creado_en) >= rangoCreada.desde) &&
        (rangoCreada.hasta === "" || diaDe(t.creado_en) <= rangoCreada.hasta) &&
        (busqueda === "" ||
          t.alumno.toLowerCase().includes(busqueda) ||
          t.detalle.toLowerCase().includes(busqueda) ||
          (t.categoria ?? "").toLowerCase().includes(busqueda)),
    )
    .sort((a, b) =>
      criterio === "antigua"
        ? a.creado_en.localeCompare(b.creado_en)
        : b.creado_en.localeCompare(a.creado_en),
    );

  // Igual que en Alumnos: la cuenta de las solapas y las opciones de los
  // filtros salen de la lista entera, solo se recorta lo que se dibuja.
  const { tope, visibles } = recortar(lista, filas);

  async function borrar(datos: FormData) {
    "use server";
    await borrarTarea(String(datos.get("id")));
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <h1 className="text-heading-20">Tareas</h1>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsUrl param="cat" valor={vistaActual.valor} vistas={vistas} />
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
                <TableCol style={{ width: "14%" }} />
                <TableCol style={{ width: "13%" }} />
                <TableCol style={{ width: "17%" }} />
                <TableCol style={{ width: "36%" }} />
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
                  <TableHead>Categoría</TableHead>
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
                    <TableCell>
                      {t.categoria ? (
                        <Badge variant="gray-subtle">{t.categoria}</Badge>
                      ) : (
                        <span className="text-[var(--ds-gray-900)]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[var(--ds-gray-1000)]">
                      <Link href={`/alumnos/${t.alumno_id}`} className="hover:underline">
                        {t.alumno}
                      </Link>
                    </TableCell>
                    {/* La tarea es texto libre: acá se lee entera, no cortada. */}
                    <TableCell className="whitespace-normal text-[var(--ds-gray-1000)]">
                      {t.detalle}
                    </TableCell>
                    <TableCell>
                      <EstadoTareaSelect id={t.id} estado={t.estado} />
                    </TableCell>
                    <TableCell className="text-center">
                      <form action={borrar}>
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
                  columnas={6}
                />
              </TableBody>
            </Table>
          </TableRoot>

        </div>
      )}
    </main>
  );
}
