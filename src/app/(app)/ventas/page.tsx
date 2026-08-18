import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { borrarVenta, borrarMovimiento, borrarPago } from "@/lib/ventas";
import { Buscador } from "@/components/buscador";
import { TabsUrl } from "@/components/tabs-url";
import { FiltroColumna } from "@/components/filtro-columna";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DollarIcon } from "@/components/icons";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const ZONA = "America/Argentina/Buenos_Aires";
const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Períodos del encabezado de Fecha. El corte se calcula acá y se manda a la
 * base: traer todo el historial para descartarlo en memoria deja de andar
 * apenas el gimnasio lleve un par de años cargados.
 */
const PERIODOS = [
  { valor: "30d", label: "Últimos 30 días", dias: 30 },
  { valor: "7d", label: "Últimos 7 días", dias: 7 },
  { valor: "90d", label: "Últimos 90 días", dias: 90 },
  { valor: "365d", label: "Último año", dias: 365 },
  { valor: "todo", label: "Todo", dias: null },
] as const;

const RUBROS = {
  mensualidad: "Mensualidades",
  consumible: "Consumibles",
  suplemento: "Suplementos",
} as const;

/** Corte del período. Fuera del render: Date.now() no es puro. */
function corteDe(dias: number | null) {
  return dias === null ? null : new Date(Date.now() - dias * 86400000).toISOString();
}

function nombreMetodo(efectivo: number, transferencia: number) {
  if (efectivo > 0 && transferencia > 0) return "Mixto";
  if (efectivo > 0) return "Efectivo";
  if (transferencia > 0) return "Transferencia";
  return "—";
}

interface VentaFila {
  id: string;
  alumno: string;
  producto: string;
  categoria: keyof typeof RUBROS | null;
  cantidad: number;
  total: number;
  efectivo: number;
  transferencia: number;
  saldo: number;
  creado_en: string;
  anulada_en: string | null;
}

interface PagoFila {
  id: string;
  venta_id: string;
  alumno: string;
  monto: number;
  metodo: "efectivo" | "transferencia";
  creado_en: string;
  anulada_en: string | null;
}

interface MovimientoFila {
  id: string;
  tipo: "ingreso" | "egreso";
  caja: "grande" | "chica";
  metodo: "efectivo" | "transferencia";
  monto: number;
  motivo: string;
  creado_en: string;
  anulado_en: string | null;
}

interface CobroFila {
  ids: string[];
  alumno: string;
  efectivo: number;
  transferencia: number;
  creado_en: string;
}

type Registro =
  | ({ clase: "venta" } & VentaFila)
  | ({ clase: "cobro" } & CobroFila)
  | ({ clase: "movimiento" } & MovimientoFila);

export default async function VentasPage({ searchParams }: PageProps<"/ventas">) {
  await requireStaff();
  const { q, rubro, periodo, orden, alumno, metodo } = await searchParams;
  const busqueda = typeof q === "string" ? q.trim().toLowerCase() : "";
  const solapa = typeof rubro === "string" ? rubro : "todos";
  const criterio = typeof orden === "string" ? orden : "reciente";
  const lista_ = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  const elegido = PERIODOS.find((p) => p.valor === periodo) ?? PERIODOS[0];
  const desde = corteDe(elegido.dias);

  const supabase = await createClient();

  let qVentas = supabase
    .from("ventas_saldo")
    .select(
      "id, alumno, producto, categoria, cantidad, total, efectivo, transferencia, saldo, creado_en, anulada_en",
    );
  let qPagos = supabase
    .from("pagos_detalle")
    .select("id, venta_id, alumno, monto, metodo, creado_en, anulada_en");
  let qMovs = supabase
    .from("movimientos_caja_detalle")
    .select("id, tipo, caja, metodo, monto, motivo, creado_en, anulado_en");

  if (desde) {
    qVentas = qVentas.gte("creado_en", desde);
    qPagos = qPagos.gte("creado_en", desde);
    qMovs = qMovs.gte("creado_en", desde);
  }

  const [{ data: ventas }, { data: pagos }, { data: movimientos }] = await Promise.all([
    qVentas.order("creado_en", { ascending: false }).overrideTypes<VentaFila[]>(),
    qPagos.order("creado_en", { ascending: false }).overrideTypes<PagoFila[]>(),
    qMovs.order("creado_en", { ascending: false }).overrideTypes<MovimientoFila[]>(),
  ]);

  // El pago hecho el mismo día que su venta ya está contado en la fila de esa
  // venta. Solo los que saldan una compra de otro día son un cobro aparte, y
  // se agrupan por alumno y momento porque un cobro puede tocar varias compras.
  const diaDeVenta = new Map((ventas ?? []).map((v) => [v.id, v.creado_en.slice(0, 10)]));
  const cobros = new Map<string, CobroFila>();
  for (const p of (pagos ?? []).filter((p) => !p.anulada_en)) {
    if (diaDeVenta.get(p.venta_id) === p.creado_en.slice(0, 10)) continue;

    const clave = `${p.alumno}|${p.creado_en}`;
    const fila = cobros.get(clave) ?? {
      ids: [],
      alumno: p.alumno,
      efectivo: 0,
      transferencia: 0,
      creado_en: p.creado_en,
    };
    fila.ids.push(p.id);
    fila[p.metodo] += p.monto;
    cobros.set(clave, fila);
  }

  const todos: Registro[] = [
    ...(ventas ?? []).map((v) => ({ clase: "venta" as const, ...v })),
    ...[...cobros.values()].map((c) => ({ clase: "cobro" as const, ...c })),
    ...(movimientos ?? []).map((m) => ({ clase: "movimiento" as const, ...m })),
  ];

  // Las solapas son "de qué es este movimiento". Los cobros y la caja no tienen
  // rubro de producto, así que tienen el suyo en vez de quedar inalcanzables.
  const rubroDe = (r: Registro) =>
    r.clase === "cobro"
      ? "cobro"
      : r.clase === "movimiento"
        ? "caja"
        : (r.categoria ?? "sin");

  const alumnoDe = (r: Registro) =>
    r.clase === "movimiento" ? "Movimiento de caja" : r.alumno;
  const detalleDe = (r: Registro) =>
    r.clase === "venta" ? r.producto : r.clase === "cobro" ? "Cobro de deuda" : r.motivo;
  const metodoDe = (r: Registro) =>
    r.clase === "movimiento" ? capitalizar(r.metodo) : nombreMetodo(r.efectivo, r.transferencia);
  const entraDe = (r: Registro) =>
    r.clase === "venta"
      ? r.efectivo + r.transferencia
      : r.clase === "cobro"
        ? r.efectivo + r.transferencia
        : r.tipo === "ingreso"
          ? r.monto
          : -r.monto;

  const solapas = [
    { valor: "todos", nombre: "Todos" },
    ...Object.entries(RUBROS).map(([valor, nombre]) => ({ valor, nombre })),
    { valor: "sin", nombre: "Sin categoría" },
    { valor: "cobro", nombre: "Cobros" },
    { valor: "caja", nombre: "Caja" },
  ].map((s) => ({
    ...s,
    cuantos: s.valor === "todos" ? todos.length : todos.filter((r) => rubroDe(r) === s.valor).length,
  }));

  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesAlumno = ordenar(todos.map(alumnoDe));
  const opcionesMetodo = ordenar(todos.map(metodoDe));

  const filtroAlumno = lista_(alumno);
  const filtroMetodo = lista_(metodo);

  const registros = todos
    .filter(
      (r) =>
        (solapa === "todos" || rubroDe(r) === solapa) &&
        (filtroAlumno.length === 0 || filtroAlumno.includes(alumnoDe(r))) &&
        (filtroMetodo.length === 0 || filtroMetodo.includes(metodoDe(r))) &&
        (busqueda === "" ||
          `${alumnoDe(r)} ${detalleDe(r)}`.toLowerCase().includes(busqueda)),
    )
    .sort((a, b) =>
      criterio === "antiguo"
        ? a.creado_en.localeCompare(b.creado_en)
        : b.creado_en.localeCompare(a.creado_en),
    );

  // Lo anulado no entró a la caja: no suma.
  const entrado = registros
    .filter((r) => !anuladoDe(r))
    .reduce((suma, r) => suma + entraDe(r), 0);

  async function borrar(formData: FormData) {
    "use server";
    await borrarVenta(String(formData.get("id")));
  }
  async function borrarCobro(formData: FormData) {
    "use server";
    for (const id of String(formData.get("id")).split(",")) await borrarPago(id);
  }
  async function borrarMov(formData: FormData) {
    "use server";
    await borrarMovimiento(String(formData.get("id")));
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-heading-20">Ventas</h1>
        <p className="text-copy-14 text-[var(--ds-gray-900)]">
          {registros.length === todos.length
            ? `${todos.length} ${todos.length === 1 ? "movimiento" : "movimientos"}`
            : `${registros.length} de ${todos.length}`}
          {" · "}
          {elegido.label.toLowerCase()}
          {entrado !== 0 && (
            <>
              {" · "}
              <span className="text-[var(--ds-gray-1000)]">{pesos(entrado)} cobrados</span>
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsUrl
            param="rubro"
            valor={solapa}
            vistas={solapas.map(({ valor, nombre, cuantos }) => ({ valor, nombre, cuantos }))}
          />
        </div>

        <Buscador inicial={typeof q === "string" ? q : ""} placeholder="Buscar alumno o detalle..." />
      </div>

      {registros.length === 0 ? (
        <EmptyState
          icon={<DollarIcon />}
          title={todos.length === 0 ? "Sin movimientos en el período" : "Nada coincide"}
          description={
            todos.length === 0
              ? "Ampliá el período desde el encabezado de Fecha."
              : "Probá con otra búsqueda o sacá los filtros de los encabezados."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
          <TableRoot className="md:max-h-[calc(100vh-19rem)]">
            <Table aria-label="Ventas y movimientos">
              <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                <TableRow>
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Fecha"
                      orden={{
                        param: "orden",
                        opciones: [
                          { valor: "reciente", label: "Más reciente" },
                          { valor: "antiguo", label: "Más antiguo" },
                        ],
                      }}
                      periodo={{
                        param: "periodo",
                        predeterminado: PERIODOS[0].valor,
                        opciones: PERIODOS.map((p) => ({ valor: p.valor, label: p.label })),
                      }}
                    />
                  </TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Alumno" param="alumno" opciones={opcionesAlumno} />
                  </TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Método" param="metodo" opciones={opcionesMetodo} />
                  </TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="text-center" />
                </TableRow>
              </TableHeader>

              <TableBody striped>
                {registros.map((r) => {
                  const anulado = anuladoDe(r);
                  const id = r.clase === "cobro" ? r.ids.join(",") : r.id;
                  const cuando = new Date(r.creado_en);
                  return (
                    <TableRow
                      key={`${r.clase}-${id}`}
                      className={anulado ? "text-muted-foreground" : undefined}
                    >
                      <TableCell className="text-[var(--ds-gray-1000)]">
                        {cuando.toLocaleDateString("es-AR", {
                          timeZone: ZONA,
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        {cuando.toLocaleTimeString("es-AR", {
                          timeZone: ZONA,
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>{alumnoDe(r)}</TableCell>
                      <TableCell>{detalleDe(r)}</TableCell>
                      <TableCell>{r.clase === "venta" ? r.cantidad : "—"}</TableCell>
                      <TableCell>
                        {anulado ? (
                          <Badge variant="red-subtle">anulado</Badge>
                        ) : (
                          metodoDe(r)
                        )}
                      </TableCell>
                      <TableCell>
                        {r.clase === "movimiento" ? (
                          <span
                            className={
                              anulado
                                ? "line-through"
                                : r.tipo === "ingreso"
                                  ? "text-[var(--ds-green-900)]"
                                  : "text-[var(--ds-red-900)]"
                            }
                          >
                            {r.tipo === "ingreso" ? "+" : "−"}
                            {pesos(r.monto)}
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {pesos(r.efectivo + r.transferencia)}
                            {r.clase === "venta" && r.saldo > 0 && (
                              <Badge variant="amber-subtle">Debe {pesos(r.saldo)}</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.clase === "venta" ? (
                          <span className={anulado ? "line-through" : undefined}>
                            {pesos(r.total)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {(
                          <form
                            action={
                              r.clase === "venta"
                                ? borrar
                                : r.clase === "cobro"
                                  ? borrarCobro
                                  : borrarMov
                            }
                          >
                            <Button
                              type="submit"
                              variant="tertiary"
                              size="sm"
                              aria-label={`Eliminar ${detalleDe(r).toLowerCase()} de ${alumnoDe(r)}`}
                              className="hover:bg-[var(--ds-red-200)] hover:text-[var(--ds-red-900)]"
                            >
                              Eliminar
                            </Button>
                            <input type="hidden" name="id" value={id} />
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableRoot>
        </div>
      )}
    </main>
  );
}

/** Un cobro no se anula "a medias": o están sus pagos o no está la fila. */
function anuladoDe(r: Registro) {
  if (r.clase === "venta") return r.anulada_en;
  if (r.clase === "movimiento") return r.anulado_en;
  return null;
}
