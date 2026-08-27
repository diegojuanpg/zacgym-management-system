"use client";

import { rangoDe, comparador } from "@/lib/filtros";
import { PERIODOS } from "@/lib/periodos";
import { capitalizar } from "@/lib/utils";
import { MostrarMas } from "@/components/mostrar-mas";
import { recortar } from "@/lib/recorte";
import { Buscador } from "@/components/buscador";
import { TabsUrl } from "@/components/tabs-url";
import { FiltroColumna } from "@/components/filtro-columna";
import { Badge } from "@/components/ui/badge";
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
import { comoObjeto, useParametros } from "@/hooks/use-navegacion";
import { BotonBorrar } from "@/components/mostrador/boton-borrar";
import { BarrasIngresos } from "@/components/barras-ingresos";
import type { DiaDeIngresos } from "@/lib/ingresos";

const ZONA = "America/Argentina/Buenos_Aires";
const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

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

function nombreMetodo(efectivo: number, transferencia: number, noPaga = 0, aFavor = 0) {
  // Sin cargo: lo que se lleva el dueño. No entra plata y no queda deuda.
  if (noPaga > 0) return "No paga";
  if (efectivo > 0 && transferencia > 0) return "Mixto";
  if (efectivo > 0) return "Efectivo";
  if (transferencia > 0) return "Transferencia";
  // Nada entró hoy: la pagó con lo que ya tenía a favor.
  if (aFavor > 0) return "A favor";
  return "—";
}

export interface VentaFila {
  id: string;
  alumno: string;
  alumno_id: string;
  producto: string;
  producto_id: string;
  turno_id: string;
  categoria: string | null;
  cantidad: number;
  total: number;
  efectivo: number;
  transferencia: number;
  no_paga: number;
  a_favor: number;
  saldo: number;
  creado_en: string;
  anulada_en: string | null;
}

export interface PagoFila {
  id: string;
  venta_id: string;
  alumno: string;
  alumno_id: string;
  turno_id: string;
  monto: number;
  metodo: "efectivo" | "transferencia" | "no_paga" | "a_favor";
  creado_en: string;
  anulada_en: string | null;
}

export interface MovimientoFila {
  id: string;
  turno_id: string;
  tipo: "ingreso" | "egreso";
  caja: "grande" | "chica";
  metodo: "efectivo" | "transferencia";
  monto: number;
  motivo: string;
  creado_en: string;
  anulado_en: string | null;
}

export interface CobroFila {
  ids: string[];
  alumno: string;
  alumno_id: string;
  turno_id: string;
  efectivo: number;
  transferencia: number;
  creado_en: string;
}

export type Registro =
  | ({ clase: "venta" } & VentaFila)
  | ({ clase: "cobro" } & CobroFila)
  | ({ clase: "movimiento" } & MovimientoFila);

/**
 * La tabla de Ventas: solapas por rubro, buscador, filtros de encabezado y las
 * filas. Recibe los registros del período y de ahí en más filtra sola.
 */
export function TablaVentas({
  registros: todos,
  etiquetaPeriodo,
  ingresos,
}: {
  registros: Registro[];
  /** "Últimos 30 días" y compañía: lo resolvió la página, acá solo se muestra. */
  etiquetaPeriodo: string;
  /** El histórico entero, ya sumado por día y rubro. El gráfico lo recorta solo. */
  ingresos: DiaDeIngresos[];
}) {
  const parametros = useParametros();
  const params = comoObjeto(parametros);
  const q = parametros.get("q") ?? "";
  const busqueda = q.trim().toLowerCase();
  const solapa = parametros.get("rubro") ?? "todos";
  const criterio = parametros.get("orden") ?? "reciente";
  const filas = parametros.get("filas") ?? undefined;
  const lista_ = (nombre: string) => parametros.getAll(nombre);
  const rangoFecha = rangoDe(parametros.get("fecha") ?? undefined);
  const hayRango = rangoFecha.desde !== "" || rangoFecha.hasta !== "";

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
        ? nombreMetodo(r.efectivo, r.transferencia, r.no_paga, r.a_favor)
        : nombreMetodo(r.efectivo, r.transferencia);
  const entraDe = (r: Registro) =>
    r.clase === "venta"
      ? r.efectivo + r.transferencia
      : r.clase === "cobro"
        ? r.efectivo + r.transferencia
        : r.tipo === "ingreso"
          ? r.monto
          : -r.monto;

  // Los rubros son los que tiene el catálogo, que se cargan desde Productos: una
  // lista fija acá dejaba sin solapa a todo lo que se clasificara después.
  const categorias = [
    ...new Set(
      todos.flatMap((r) => (r.clase === "venta" && r.categoria !== null ? [r.categoria] : [])),
    ),
  ].sort(
    (a, b) => a.localeCompare(b, "es"),
  );

  // "Todos" queda primera porque es la vista entera, no un rubro. El resto va de
  // mayor a menor: la solapa que más movimientos tiene es la que más se abre, y
  // a la izquierda es donde primero se la busca.
  const solapas = [
    { valor: "todos", nombre: "Todos", cuantos: todos.length },
    ...[
      ...categorias.map((c) => ({ valor: c, nombre: capitalizar(c) })),
      { valor: "sin", nombre: "Sin categoría" },
      { valor: "cobro", nombre: "Cobros" },
      { valor: "caja", nombre: "Movimientos de caja" },
    ]
      .map((s) => ({ ...s, cuantos: todos.filter((r) => rubroDe(r) === s.valor).length }))
      // Desempate alfabético: dos rubros en cero no se pisan el orden de una
      // carga a la otra.
      .sort((a, b) => b.cuantos - a.cuantos || a.nombre.localeCompare(b.nombre, "es")),
  ];

  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesAlumno = ordenar(todos.map(alumnoDe));
  const opcionesDetalle = ordenar(todos.map(detalleDe));
  const opcionesMetodo = ordenar(todos.map(metodoDe));

  const filtroAlumno = lista_("alumno");
  const filtroDetalle = lista_("detalle");
  const filtroMetodo = lista_("metodo");
  const rangoHora = rangoDe(parametros.get("hora") ?? undefined);
  const filtroPago = comparador(parametros.get("pago") ?? undefined);
  const filtroTotal = comparador(parametros.get("total") ?? undefined);

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
  const { tope, visibles } = recortar(registros, filas);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-heading-20">Ventas</h1>
        <p className="text-copy-14 text-[var(--ds-gray-900)]">
          {registros.length === todos.length
            ? `${todos.length} ${todos.length === 1 ? "movimiento" : "movimientos"}`
            : `${registros.length} de ${todos.length}`}
          {" · "}
          {hayRango
            ? `${diaCorto(rangoFecha.desde) || "el inicio"} → ${diaCorto(rangoFecha.hasta) || "hoy"}`
            : etiquetaPeriodo.toLowerCase()}
        </p>
      </div>

      <div className="material-base rounded-lg border border-[var(--ds-gray-alpha-400)] p-4">
        <BarrasIngresos ingresos={ingresos} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsUrl
            param="rubro"
            valor={solapa}
            vistas={solapas.map(({ valor, nombre, cuantos }) => ({ valor, nombre, cuantos }))}
          />
        </div>

        <Buscador inicial={q} placeholder="Buscar alumno o detalle..." />
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
                        <BotonBorrar
                          registro={
                            r.clase === "venta"
                              ? {
                                  clase: "venta",
                                  id: r.id,
                                  turno_id: r.turno_id,
                                  creado_en: r.creado_en,
                                  alumno_id: r.alumno_id,
                                  producto_id: r.producto_id,
                                  cantidad: r.cantidad,
                                  efectivo: r.efectivo,
                                  transferencia: r.transferencia,
                                  no_paga: r.no_paga,
                                }
                              : r.clase === "movimiento"
                                ? {
                                    clase: "movimiento",
                                    id: r.id,
                                    turno_id: r.turno_id,
                                    creado_en: r.creado_en,
                                    tipo: r.tipo,
                                    monto: r.monto,
                                    motivo: r.motivo,
                                    caja: r.caja,
                                    metodo: r.metodo,
                                  }
                                : {
                                    clase: "cobro",
                                    ids: r.ids,
                                    turno_id: r.turno_id,
                                    creado_en: r.creado_en,
                                    alumno_id: r.alumno_id,
                                    efectivo: r.efectivo,
                                    transferencia: r.transferencia,
                                  }
                          }
                          etiqueta={`${detalleDe(r).toLowerCase()} de ${alumnoDe(r)}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                <MostrarMas
                  ruta="/ventas"
                  params={params}
                  tope={tope}
                  enPagina={visibles.length}
                  total={registros.length}
                  columnas={10}
                />
              </TableBody>
            </Table>
          </TableRoot>
        </div>
      )}
    </div>
  );
}

/** Un cobro no se anula "a medias": o están sus pagos o no está la fila. */
function anuladoDe(r: Registro) {
  if (r.clase === "venta") return r.anulada_en;
  if (r.clase === "movimiento") return r.anulado_en;
  return null;
}
