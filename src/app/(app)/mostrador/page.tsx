import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { borrarVenta, borrarMovimiento, borrarPago } from "@/lib/ventas";
import { NuevaVentaModal } from "@/components/mostrador/nueva-venta-modal";
import { AccionesModal } from "@/components/mostrador/acciones-modal";
import { TurnoModal } from "@/components/mostrador/turno-modal";
import { CerrarTurnoModal } from "@/components/mostrador/cerrar-turno-modal";
import {
  ResponsablesModal,
  type TramoResponsable,
} from "@/components/mostrador/responsables-modal";
import { CajaCard } from "@/components/mostrador/caja-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FiltroColumna } from "@/components/filtro-columna";
import { EmptyState } from "@/components/ui/empty-state";
import { CartIcon } from "@/components/icons";
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

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

function nombreMetodo(efectivo: number, transferencia: number, noPaga = 0) {
  // Sin cargo: lo que se lleva el dueño. No entra plata y no queda deuda.
  if (noPaga > 0) return "No paga";
  if (efectivo > 0 && transferencia > 0) return "Mixto";
  if (efectivo > 0) return "Efectivo";
  if (transferencia > 0) return "Transferencia";
  return "—";
}

interface MovimientoFila {
  id: string;
  tipo: "ingreso" | "egreso";
  caja: "grande" | "chica";
  metodo: "efectivo" | "transferencia";
  monto: number;
  motivo: string;
  delta: number;
  creado_en: string;
  anulado_en: string | null;
}

interface VentaFila {
  id: string;
  alumno: string;
  producto: string;
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
  producto: string;
  monto: number;
  metodo: "efectivo" | "transferencia" | "no_paga";
  caja: "grande" | "chica";
  creado_en: string;
  anulada_en: string | null;
}

interface TurnoAbierto {
  id: string;
  abierto_en: string;
  caja_grande_inicial: number;
  caja_chica_inicial: number;
  ventas_grande: number;
  ventas_chica: number;
  movimientos_grande: number;
  movimientos_chica: number;
  caja_grande_esperada: number;
  caja_chica_esperada: number;
  responsables: string[];
  responsables_detalle: TramoResponsable[];
}

/** Un cobro puede tocar varias compras impagas: se muestran como una sola fila. */
interface CobroFila {
  ids: string[];
  alumno: string;
  efectivo: number;
  transferencia: number;
  creado_en: string;
}

export default async function MostradorPage({ searchParams }: PageProps<"/mostrador">) {
  await requireStaff();
  const { orden, alumno, detalle, metodo } = await searchParams;
  // Un filtro se manda como el mismo parametro repetido: ?alumno=X&alumno=Y.
  const lista = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  const supabase = await createClient();

  // El mostrador es el turno abierto, no el dia: un turno puede cruzar la
  // medianoche y en un dia puede haber varios. Los dias pasados se miran en
  // Ventas, que para eso esta.
  // El turno y los catalogos no dependen entre si: van en la misma vuelta.
  const [
    { data: turno },
    { data: alumnos },
    { data: productos },
    { data: empleados },
    { data: promos },
    { data: categorias },
  ] = await Promise.all([
      supabase
        .from("turno_actual")
        .select(
          "id, abierto_en, caja_grande_inicial, caja_chica_inicial, ventas_grande, ventas_chica, movimientos_grande, movimientos_chica, caja_grande_esperada, caja_chica_esperada, responsables, responsables_detalle",
        )
        .maybeSingle<TurnoAbierto>(),
      supabase
        .from("alumnos_cuenta")
        .select("id, nombre_completo, saldo")
        // Sin filtrar por activo: el que dejó de venir hace un año y vuelve a
        // pagar la cuota tiene que poder encontrarse para cobrarle.
        .limit(5000)
        .order("nombre_completo")
        .overrideTypes<{ id: string; nombre_completo: string; saldo: number }[]>(),
      supabase
        .from("productos")
        .select("id, nombre, precio, stock, contar_en_turno")
        .eq("activo", true)
        .order("nombre"),
      supabase.from("empleados").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("alumno_promo").select("alumno_id, promo, producto_id, producto, precio"),
      supabase.from("tarea_categorias").select("id, nombre").order("nombre"),
    ]);

  // Sin turno abierto no hay nada que listar: la tabla arranca vacia.
  const porTurno = <T,>(tabla: string, columnas: string) =>
    turno
      ? supabase
          .from(tabla)
          .select(columnas)
          .eq("turno_id", turno.id)
          .order("creado_en", { ascending: false })
          .overrideTypes<T[]>()
      : Promise.resolve({ data: [] as T[] });

  const [{ data: ventas }, { data: pagos }, { data: movimientos }] = await Promise.all([
    porTurno<VentaFila>(
      "ventas_saldo",
      "id, alumno, producto, cantidad, total, efectivo, transferencia, no_paga, saldo, creado_en, anulada_en",
    ),
    porTurno<PagoFila>(
      "pagos_detalle",
      "id, venta_id, alumno, producto, monto, metodo, caja, creado_en, anulada_en",
    ),
    porTurno<MovimientoFila>(
      "movimientos_caja_detalle",
      "id, tipo, caja, metodo, monto, motivo, delta, creado_en, anulado_en",
    ),
  ]);

  // Al turno entran solo los marcados en el catálogo. Contar los 43 que llevan
  // stock, dos veces por turno, son 86 números que nadie carga.
  const aContar = (productos ?? [])
    .filter((p): p is typeof p & { stock: number } => p.contar_en_turno && p.stock !== null)
    .map((p) => ({ id: p.id, nombre: p.nombre, stock: p.stock }));

  // Lo cobrado por cada venta del turno. La cuenta de cuánto debería haber en
  // cada cajón ya no se hace acá: la trae `turno_actual`, que arranca del saldo
  // con el que se abrió.
  const pagosDeVenta = new Map<
    string,
    { efectivo: number; transferencia: number; no_paga: number }
  >();
  for (const p of pagos ?? []) {
    const acumulado =
      pagosDeVenta.get(p.venta_id) ?? { efectivo: 0, transferencia: 0, no_paga: 0 };
    acumulado[p.metodo] += p.monto;
    pagosDeVenta.set(p.venta_id, acumulado);
  }

  // Pagos de hoy contra ventas de otros dias: eso es un cobro de deuda. Se agrupan
  // por alumno y momento porque un solo cobro puede saldar varias compras.
  const idsDeHoy = new Set((ventas ?? []).map((v) => v.id));
  const cobros = new Map<string, CobroFila>();
  for (const p of (pagos ?? []).filter((p) => !idsDeHoy.has(p.venta_id) && !p.anulada_en)) {
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

  // Lo que deberia haber en cada cajon ahora mismo: el saldo con el que se abrio
  // el turno mas todo lo que entro y salio desde entonces. Lo calcula la vista,
  // que es la misma cuenta que usa el cierre para decir si cuadra.
  const totales = [
    {
      etiqueta: "Caja grande efectivo",
      inicial: turno?.caja_grande_inicial ?? 0,
      ventas: turno?.ventas_grande ?? 0,
      movimientos: turno?.movimientos_grande ?? 0,
      esperado: turno?.caja_grande_esperada ?? 0,
    },
    {
      etiqueta: "Caja chica efectivo",
      inicial: turno?.caja_chica_inicial ?? 0,
      ventas: turno?.ventas_chica ?? 0,
      movimientos: turno?.movimientos_chica ?? 0,
      esperado: turno?.caja_chica_esperada ?? 0,
    },
  ];

  type Registro =
    | ({ clase: "venta" } & VentaFila)
    | ({ clase: "movimiento" } & MovimientoFila)
    | ({ clase: "cobro" } & CobroFila);

  const todos: Registro[] = [
    // El pago que muestra la fila es el de hoy, no el historico de la venta.
    ...(ventas ?? []).map((v) => ({
      clase: "venta" as const,
      ...v,
      ...(pagosDeVenta.get(v.id) ?? { efectivo: 0, transferencia: 0, no_paga: 0 }),
    })),
    ...(movimientos ?? []).map((m) => ({ clase: "movimiento" as const, ...m })),
    ...[...cobros.values()].map((c) => ({ clase: "cobro" as const, ...c })),
  ];

  const metodoDe = (r: Registro) =>
    r.clase === "movimiento"
      ? capitalizar(r.metodo)
      : r.clase === "venta"
        ? nombreMetodo(r.efectivo, r.transferencia, r.no_paga)
        : nombreMetodo(r.efectivo, r.transferencia);
  const detalleDe = (r: Registro) =>
    r.clase === "venta" ? r.producto : r.clase === "cobro" ? "Cobro de deuda" : r.motivo;
  const alumnoDe = (r: Registro) =>
    r.clase === "movimiento" ? "Movimiento de caja" : r.alumno;

  // Opciones de los menús: solo lo que aparece en el día, para no listar 200 alumnos.
  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesAlumno = ordenar(todos.map(alumnoDe));
  const opcionesDetalle = ordenar(todos.map(detalleDe));
  const opcionesMetodo = ordenar(todos.map(metodoDe));

  const filtroAlumno = lista(alumno);
  const filtroDetalle = lista(detalle);
  const filtroMetodo = lista(metodo);

  const registros = todos
    .filter(
      (r) =>
        (filtroAlumno.length === 0 || filtroAlumno.includes(alumnoDe(r))) &&
        (filtroDetalle.length === 0 || filtroDetalle.includes(detalleDe(r))) &&
        (filtroMetodo.length === 0 || filtroMetodo.includes(metodoDe(r))),
    )
    .sort((a, b) =>
      orden === "antiguo"
        ? a.creado_en.localeCompare(b.creado_en)
        : b.creado_en.localeCompare(a.creado_en),
    );

  const hayFiltro = filtroAlumno.length + filtroDetalle.length + filtroMetodo.length > 0;

  async function borrarMov(formData: FormData) {
    "use server";
    await borrarMovimiento(String(formData.get("id")));
  }

  async function borrarCobro(formData: FormData) {
    "use server";
    // Un cobro puede haberse repartido en varios pagos: se van todos juntos.
    for (const id of String(formData.get("id")).split(",")) await borrarPago(id);
  }

  async function borrar(formData: FormData) {
    "use server";
    await borrarVenta(String(formData.get("id")));
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-heading-20">Mostrador</h1>
          <p className="text-copy-14 text-[var(--ds-gray-900)]">
            {!turno ? (
              "Turno cerrado"
            ) : (
              <>
                A cargo:{" "}
                <span className="text-[var(--ds-gray-1000)]">
                  {/* La hora es solo del que entró después: si arrancaron
                      todos juntos ya la dice el "desde las" de al lado. */}
                  {turno.responsables_detalle
                    .filter((r) => r.hasta === null)
                    .map((r) =>
                      r.desde === turno.abierto_en
                        ? r.nombre
                        : `${r.nombre} (desde las ${horaCorta(r.desde)})`,
                    )
                    .join(", ")}
                </span>
                {" · turno desde las "}
                {horaCorta(turno.abierto_en)}
                {registros.length > 0 &&
                  ` · ${registros.length} ${registros.length === 1 ? "movimiento" : "movimientos"}`}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {turno && (
              <>
                <ResponsablesModal
                  empleados={empleados ?? []}
                  tramos={turno.responsables_detalle}
                  abiertoEn={turno.abierto_en}
                />
                <CerrarTurnoModal
                  esperadoGrande={turno.caja_grande_esperada}
                  esperadoChica={turno.caja_chica_esperada}
                  responsables={turno.responsables}
                  productos={aContar}
                />
              </>
            )}
          </div>

          {/* Sin turno los dos botones quedan bloqueados: el tooltip dice por qué. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* render: el botón del sistema se dibuja como link, sin anidar <a><button>.
                nativeButton en false para que Base UI no espere un <button> real. */}
            <Button variant="secondary" nativeButton={false} render={<Link href="/productos" />}>
              Productos
            </Button>
            <AccionesModal
              alumnos={alumnos ?? []}
              categorias={categorias ?? []}
              bloqueado={!turno}
            />
            <NuevaVentaModal
              alumnos={alumnos ?? []}
              productos={productos ?? []}
              promos={promos ?? []}
              bloqueado={!turno}
            />
          </div>
        </div>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {totales.map((t) => (
            <CajaCard key={t.etiqueta} {...t} abierto={turno !== null} />
          ))}
        </section>

        {!turno ? (
          <EmptyState
            icon={<CartIcon />}
            title="No hay ningún turno abierto"
            description="Para cargar ventas, cobros o movimientos de caja tenés que iniciar el turno y decir quién está a cargo."
            action={<TurnoModal empleados={empleados ?? []} productos={aContar} />}
          />
        ) : registros.length === 0 ? (
          <EmptyState
            icon={<CartIcon />}
            title={hayFiltro ? "Nada coincide con el filtro" : "Sin movimientos en este turno"}
            description={
              hayFiltro
                ? "Probá quitando el filtro desde el encabezado de la columna."
                : "Cargá las ventas y los movimientos de caja con el botón de arriba y aparecen acá."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
            <TableRoot className="md:max-h-[calc(100vh-21rem)]">
              <Table aria-label="Movimientos del día">
                <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                  <TableRow>
                    <TableHead>
                      <FiltroColumna
                        etiqueta="Hora"
                        orden={{
                          param: "orden",
                          opciones: [
                            { valor: "reciente", label: "Más reciente" },
                            { valor: "antiguo", label: "Más antiguo" },
                          ],
                        }}
                      />
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
                    <TableHead>Pago</TableHead>
                    <TableHead numeric>Total</TableHead>
                    <TableHead className="text-center" />
                  </TableRow>
                </TableHeader>
                <TableBody striped>
                  {registros.map((r) => {
                    const anulado =
                      r.clase === "venta"
                        ? r.anulada_en
                        : r.clase === "movimiento"
                          ? r.anulado_en
                          : null;
                    const id = r.clase === "cobro" ? r.ids.join(",") : r.id;
                    return (
                      <TableRow
                        key={`${r.clase}-${id}`}
                        className={anulado ? "text-muted-foreground" : undefined}
                      >
                        <TableCell>
                          {new Date(r.creado_en).toLocaleTimeString("es-AR", {
                            timeZone: ZONA,
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>

                        {r.clase === "venta" ? (
                          <>
                            <TableCell>{r.alumno}</TableCell>
                            <TableCell>{r.producto}</TableCell>
                            <TableCell>{r.cantidad}</TableCell>
                            <TableCell>
                              {anulado ? (
                                <Badge variant="red-subtle">anulada</Badge>
                              ) : (
                                nombreMetodo(r.efectivo, r.transferencia, r.no_paga)
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {pesos(r.efectivo + r.transferencia)}
                                {r.saldo > 0 && (
                                  <Badge variant="amber-subtle">Debe {pesos(r.saldo)}</Badge>
                                )}
                                {r.saldo < 0 && (
                                  <Badge variant="blue-subtle">A favor {pesos(-r.saldo)}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell numeric>
                              <span className={anulado ? "line-through" : undefined}>
                                {pesos(r.total)}
                              </span>
                            </TableCell>
                          </>
                        ) : r.clase === "cobro" ? (
                          <>
                            <TableCell>{r.alumno}</TableCell>
                            <TableCell>Cobro de deuda</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>{nombreMetodo(r.efectivo, r.transferencia)}</TableCell>
                            <TableCell>{pesos(r.efectivo + r.transferencia)}</TableCell>
                            <TableCell numeric>—</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-muted-foreground capitalize">
                              Caja {r.caja}
                            </TableCell>
                            <TableCell>{r.motivo}</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>
                              {anulado ? (
                                <Badge variant="red-subtle">anulado</Badge>
                              ) : (
                                <span className="capitalize">{r.metodo}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span
                                className={
                                  anulado
                                    ? "line-through"
                                    : r.tipo === "ingreso"
                                      ? "text-[var(--ds-green-900)]"
                                      : "text-[var(--ds-amber-900)]"
                                }
                              >
                                {r.tipo === "ingreso" ? "+" : "−"}
                                {pesos(r.monto)}
                              </span>
                            </TableCell>
                            <TableCell numeric>—</TableCell>
                          </>
                        )}

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
                                // Sin esto un lector de pantalla oye "Eliminar"
                                // veinte veces y ninguna dice qué se elimina.
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
