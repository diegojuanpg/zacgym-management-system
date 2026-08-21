import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { borrarVenta, borrarMovimiento, borrarPago } from "@/lib/ventas";
import { rangoDe, comparador } from "@/lib/filtros";
import { traerTodo } from "@/lib/traer-todo";
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
  // El primero es el que sale por defecto. Arranca en todo: acotar de entrada
  // escondia el historico y dejaba solapas en cero que parecian datos faltantes.
  { valor: "todo", label: "Todo", dias: null },
  { valor: "7d", label: "Últimos 7 días", dias: 7 },
  { valor: "30d", label: "Últimos 30 días", dias: 30 },
  { valor: "90d", label: "Últimos 90 días", dias: 90 },
  { valor: "365d", label: "Último año", dias: 365 },
] as const;

/** Cuántas filas dibuja la tabla por vez. */
const TANDA_FILAS = 200;

const RUBROS = {
  mensualidad: "Mensualidades",
  consumible: "Consumibles",
  suplemento: "Suplementos",
} as const;

/** Corte del período. Fuera del render: Date.now() no es puro. */
function corteDe(dias: number | null) {
  return dias === null ? null : new Date(Date.now() - dias * 86400000).toISOString();
}

/** 2026-08-01 se lee 01/08: el año se sobreentiende. */
const diaCorto = (f: string) => f.split("-").reverse().slice(0, 2).join("/");

/** La hora local en HH:MM, que es lo que se compara contra el rango elegido. */
const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

function nombreMetodo(efectivo: number, transferencia: number, noPaga = 0) {
  // Sin cargo: lo que se lleva el dueño. No entra plata y no queda deuda.
  if (noPaga > 0) return "No paga";
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
  no_paga: number;
  saldo: number;
  creado_en: string;
  anulada_en: string | null;
}

interface PagoFila {
  id: string;
  venta_id: string;
  alumno: string;
  monto: number;
  metodo: "efectivo" | "transferencia" | "no_paga";
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
  const parametros = await searchParams;
  const { q, rubro, periodo, orden, alumno, detalle, metodo, fecha, hora, pago, total, filas } =
    parametros;
  const busqueda = typeof q === "string" ? q.trim().toLowerCase() : "";
  const solapa = typeof rubro === "string" ? rubro : "todos";
  const criterio = typeof orden === "string" ? orden : "reciente";
  const lista_ = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  const elegido = PERIODOS.find((p) => p.valor === periodo) ?? PERIODOS[0];
  // Un rango de fechas explícito manda sobre el período: si el usuario eligió
  // "del 1 al 15", el "últimos 30 días" de al lado no tiene nada que decir.
  // Argentina no cambia de hora: el -03:00 fijo alcanza para pasar a UTC.
  const rangoFecha = rangoDe(fecha);
  const hayRango = rangoFecha.desde !== "" || rangoFecha.hasta !== "";
  const desde = hayRango
    ? rangoFecha.desde
      ? `${rangoFecha.desde}T00:00:00-03:00`
      : null
    : corteDe(elegido.dias);
  const hasta = rangoFecha.hasta ? `${rangoFecha.hasta}T23:59:59.999-03:00` : null;

  const supabase = await createClient();

  let qVentas = supabase
    .from("ventas_saldo")
    .select(
      "id, alumno, producto, categoria, cantidad, total, efectivo, transferencia, no_paga, saldo, creado_en, anulada_en",
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
  if (hasta) {
    qVentas = qVentas.lte("creado_en", hasta);
    qPagos = qPagos.lte("creado_en", hasta);
    qMovs = qMovs.lte("creado_en", hasta);
  }

  const [ventas, pagos, movimientos] = await Promise.all([
    traerTodo<VentaFila>(qVentas.order("creado_en", { ascending: false })),
    traerTodo<PagoFila>(qPagos.order("creado_en", { ascending: false })),
    traerTodo<MovimientoFila>(qMovs.order("creado_en", { ascending: false })),
  ]);

  // El pago hecho el mismo día que su venta ya está contado en la fila de esa
  // venta. Solo los que saldan una compra de otro día son un cobro aparte, y
  // se agrupan por alumno y momento porque un cobro puede tocar varias compras.
  const diaDeVenta = new Map(ventas.map((v) => [v.id, v.creado_en.slice(0, 10)]));
  const cobros = new Map<string, CobroFila>();
  for (const p of pagos.filter((p) => !p.anulada_en)) {
    if (diaDeVenta.get(p.venta_id) === p.creado_en.slice(0, 10)) continue;
    // Sin cargo no es plata que entró: no arma un cobro de deuda.
    if (p.metodo === "no_paga") continue;

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
    ...ventas.map((v) => ({ clase: "venta" as const, ...v })),
    ...[...cobros.values()].map((c) => ({ clase: "cobro" as const, ...c })),
    ...movimientos.map((m) => ({ clase: "movimiento" as const, ...m })),
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
    r.clase === "movimiento"
      ? capitalizar(r.metodo)
      : r.clase === "venta"
        ? nombreMetodo(r.efectivo, r.transferencia, r.no_paga)
        : nombreMetodo(r.efectivo, r.transferencia);
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
  const opcionesDetalle = ordenar(todos.map(detalleDe));
  const opcionesMetodo = ordenar(todos.map(metodoDe));

  const filtroAlumno = lista_(alumno);
  const filtroDetalle = lista_(detalle);
  const filtroMetodo = lista_(metodo);
  const rangoHora = rangoDe(hora);
  const filtroPago = comparador(pago);
  const filtroTotal = comparador(total);

  const registros = todos
    .filter(
      (r) =>
        (solapa === "todos" || rubroDe(r) === solapa) &&
        (filtroAlumno.length === 0 || filtroAlumno.includes(alumnoDe(r))) &&
        (filtroDetalle.length === 0 || filtroDetalle.includes(detalleDe(r))) &&
        (filtroMetodo.length === 0 || filtroMetodo.includes(metodoDe(r))) &&
        (rangoHora.desde === "" || horaDe(r.creado_en) >= rangoHora.desde) &&
        (rangoHora.hasta === "" || horaDe(r.creado_en) <= rangoHora.hasta) &&
        (filtroPago === null || filtroPago(entraDe(r))) &&
        // El total es de la venta: cobros y caja no tienen uno que comparar.
        (filtroTotal === null || filtroTotal(r.clase === "venta" ? r.total : null)) &&
        (busqueda === "" ||
          `${alumnoDe(r)} ${detalleDe(r)}`.toLowerCase().includes(busqueda)),
    )
    .sort((a, b) =>
      criterio === "antiguo"
        ? a.creado_en.localeCompare(b.creado_en)
        : b.creado_en.localeCompare(a.creado_en),
    );

  // La tabla se dibuja de a tandas. Con el período en "Todo" el filtro deja más
  // de cinco mil filas, y pintarlas todas de una es medio segundo de puro HTML
  // que nadie va a leer. El resumen de arriba y el total sí miran todo.
  const tope = Math.max(TANDA_FILAS, Number(typeof filas === "string" ? filas : "") || 0);
  const visibles = registros.slice(0, tope);

  /** La misma búsqueda pero con una tanda más. Es un link: no necesita JS. */
  function linkConMasFilas() {
    const otros = new URLSearchParams();
    for (const [clave, valor] of Object.entries(parametros)) {
      if (valor === undefined) continue;
      for (const uno of Array.isArray(valor) ? valor : [valor]) otros.append(clave, uno);
    }
    otros.set("filas", String(tope + TANDA_FILAS));
    return `/ventas?${otros}`;
  }

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
          {hayRango
            ? `${diaCorto(rangoFecha.desde) || "el inicio"} → ${diaCorto(rangoFecha.hasta) || "hoy"}`
            : elegido.label.toLowerCase()}
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
                      rango={{ param: "fecha", tipo: "date" }}
                    />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Hora" rango={{ param: "hora", tipo: "time" }} />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Alumno" param="alumno" opciones={opcionesAlumno} />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Detalle" param="detalle" opciones={opcionesDetalle} />
                  </TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Método" param="metodo" opciones={opcionesMetodo} />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Pago" monto={{ param: "pago" }} />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Total" monto={{ param: "total" }} />
                  </TableHead>
                  <TableHead className="text-center" />
                </TableRow>
              </TableHeader>

              <TableBody striped>
                {visibles.map((r) => {
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
                {registros.length > visibles.length && (
                  <TableRow className="!bg-transparent">
                    <TableCell colSpan={10} className="!py-3 text-center">
                      <Button variant="secondary" nativeButton={false} render={<Link href={linkConMasFilas()} />}>
                        Mostrar {Math.min(TANDA_FILAS, registros.length - visibles.length)} más
                        <span className="text-[var(--ds-gray-900)]">
                          {" "}
                          · {visibles.length} de {registros.length}
                        </span>
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
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
