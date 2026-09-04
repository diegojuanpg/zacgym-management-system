"use client";

import { saltosEntreTurnos } from "@/lib/caja";
import { useParametros } from "@/hooks/use-navegacion";
import { horaCorta } from "@/lib/utils";
import { FiltroColumna } from "@/components/filtro-columna";
import { TurnoSeparador, type TurnoDelDia } from "@/components/mostrador/turno-separador";
import { BotonBorrar } from "@/components/mostrador/boton-borrar";
import { MetodoPagoSelect } from "@/components/mostrador/metodo-pago-select";
import { MontoEditable } from "@/components/mostrador/monto-editable";
import { Badge } from "@/components/ui/badge";
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

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

export interface MovimientoFila {
  id: string;
  tipo: "ingreso" | "egreso";
  caja: "grande" | "chica";
  metodo: "efectivo" | "transferencia";
  monto: number;
  motivo: string;
  delta: number;
  turno_id: string;
  creado_en: string;
  anulado_en: string | null;
}

export interface VentaFila {
  id: string;
  alumno: string;
  producto: string;
  cantidad: number;
  total: number;
  efectivo: number;
  transferencia: number;
  no_paga: number;
  a_favor: number;
  alumno_id: string;
  producto_id: string;
  saldo: number;
  turno_id: string;
  creado_en: string;
  anulada_en: string | null;
}

export interface PagoFila {
  id: string;
  venta_id: string;
  alumno: string;
  alumno_id: string;
  producto: string;
  monto: number;
  metodo: "efectivo" | "transferencia" | "no_paga" | "a_favor";
  caja: "grande" | "chica";
  turno_id: string;
  creado_en: string;
  anulada_en: string | null;
  /** El dueño de la mercadería, del producto de la venta. null = del GYM. */
  vendedor: string | null;
}

/** Un cobro puede tocar varias compras impagas: se muestran como una sola fila. */
export interface CobroFila {
  ids: string[];
  alumno: string;
  alumno_id: string;
  efectivo: number;
  transferencia: number;
  turno_id: string;
  creado_en: string;
}

export type Registro =
  | ({ clase: "venta" } & VentaFila)
  | ({ clase: "movimiento" } & MovimientoFila)
  | ({ clase: "cobro" } & CobroFila);

/**
 * Un turno del día tal como lo dibuja la tabla. El abierto llega con
 * `cerrado_en` en null y no lleva cabecera; el salto contra el turno anterior
 * se calcula acá.
 */
export type TurnoDia = Omit<TurnoDelDia, "cerrado_en" | "salto"> & { cerrado_en: string | null };

/**
 * Los movimientos del día, agrupados por turno.
 *
 * Recibe todo lo del día y filtra en el navegador: los menús de las columnas
 * son los mismos registros mirados de otra manera, no otra consulta. El día
 * que se mira sí lo decide el server, y por eso vive afuera.
 */
export function TablaMostrador({
  registros: delTurno,
  turnos: turnosDelDia,
  esHoy,
  hayTurno,
}: {
  registros: Registro[];
  turnos: TurnoDia[];
  esHoy: boolean;
  /** Si hay un turno abierto ahora: cambia qué dice la pantalla vacía. */
  hayTurno: boolean;
}) {
  const parametros = useParametros();
  const orden = parametros.get("orden") ?? undefined;
  const lista = (nombre: string) => parametros.getAll(nombre);
  const alumno = "alumno";
  const detalle = "detalle";
  const metodo = "metodo";

  const metodoDe = (r: Registro) =>
    r.clase === "movimiento"
      ? capitalizar(r.metodo)
      : r.clase === "venta"
        ? nombreMetodo(r.efectivo, r.transferencia, r.no_paga, r.a_favor)
        : nombreMetodo(r.efectivo, r.transferencia);
  const detalleDe = (r: Registro) =>
    r.clase === "venta" ? r.producto : r.clase === "cobro" ? "Cobro de deuda" : r.motivo;
  const alumnoDe = (r: Registro) =>
    r.clase === "movimiento" ? "Movimiento de caja" : r.alumno;

  // Opciones de los menús: solo lo que aparece en el día, para no listar 200 alumnos.
  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesAlumno = ordenar(delTurno.map(alumnoDe));
  const opcionesDetalle = ordenar(delTurno.map(detalleDe));
  const opcionesMetodo = ordenar(delTurno.map(metodoDe));

  const filtroAlumno = lista(alumno);
  const filtroDetalle = lista(detalle);
  const filtroMetodo = lista(metodo);

  const registros = delTurno
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

  // La lista que se dibuja: cada turno con su cabecera y abajo sus movimientos.
  // Los turnos van del mas nuevo al mas viejo, y adentro de cada uno los
  // movimientos siguen el orden que pida la columna Hora.
  type Fila =
    | { clase: "turno"; turno: TurnoDelDia }
    | { clase: "fila"; registro: Registro }
    | { clase: "vacio"; id: string };
  const saltos = saltosEntreTurnos(turnosDelDia);
  const filas: Fila[] = turnosDelDia.flatMap((t): Fila[] => {
    const suyos = registros
      .filter((r) => r.turno_id === t.id)
      .map((registro) => ({ clase: "fila" as const, registro }));
    // El turno abierto no lleva cabecera: va arriba de todo y el encabezado de
    // la pagina ya dice desde cuando viene y quien esta a cargo.
    if (t.cerrado_en === null) return suyos;
    const cabecera = {
      clase: "turno" as const,
      turno: { ...t, cerrado_en: t.cerrado_en, salto: saltos.get(t.id) ?? null },
    };
    // Un turno cerrado sin nada cargado igual va: la cabecera dice quién estuvo,
    // cuánto contó y si le faltó stock, que es informacion propia del turno y no
    // de las ventas. Antes se descartaba y el turno desaparecia de la pantalla.
    if (suyos.length === 0) return [cabecera, { clase: "vacio" as const, id: t.id }];
    return [cabecera, ...suyos];
  });


  return (
    <>
        {/* Iniciar turno solo aparece parado en hoy: abrir un turno con fecha de
            la semana pasada no existe. */}
        {esHoy && !hayTurno && registros.length === 0 ? (
          <EmptyState
            icon={<CartIcon />}
            title="No hay ningún turno abierto"
            description="Para cargar ventas, cobros o movimientos de caja tenés que iniciar el turno contando la caja y el stock."
          />
        ) : filas.length === 0 ? (
          // La pantalla vacía se decide por lo que se va a dibujar y no por las
          // ventas: un día donde el único turno no vendió nada igual tiene algo
          // que mostrar —quién estuvo y cuánto contó—, y antes desaparecía.

          <EmptyState
            icon={<CartIcon />}
            title={
              hayFiltro
                ? "Nada coincide con el filtro"
                : esHoy && hayTurno
                  ? "Sin movimientos en este turno"
                  : "Sin movimientos este día"
            }
            description={
              hayFiltro
                ? "Probá quitando el filtro desde el encabezado de la columna."
                : esHoy
                  ? "Cargá las ventas y los movimientos de caja con el botón de arriba y aparecen acá."
                  : "Ese día no quedó nada anotado."
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
                  {filas.map((f) => {
                    // La cabecera del turno ocupa toda la fila: asi la tabla no
                    // pierde el alineado de columnas ni el encabezado pegajoso.
                    if (f.clase === "turno") {
                      return (
                        <TableRow key={`turno-${f.turno.id}`} className="!bg-transparent">
                          <TableCell colSpan={8} className="whitespace-normal !p-0">
                            <TurnoSeparador turno={f.turno} />
                          </TableCell>
                        </TableRow>
                      );
                    }
                    if (f.clase === "vacio") {
                      return (
                        <TableRow key={`vacio-${f.id}`}>
                          <TableCell colSpan={8} className="text-muted-foreground">
                            Sin ventas ni movimientos en este turno
                          </TableCell>
                        </TableRow>
                      );
                    }
                    const r = f.registro;
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
                          {horaCorta(r.creado_en)}
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
                                <MetodoPagoSelect registro={r} anulado={false} />
                              )}
                            </TableCell>
                            <TableCell>
                              <MontoEditable
                                registro={r}
                                monto={r.efectivo + r.transferencia}
                                tipo="venta"
                                anulado={Boolean(anulado)}
                                extra={
                                  <>
                                    {r.saldo > 0 && (
                                      <Badge variant="amber-subtle">Debe {pesos(r.saldo)}</Badge>
                                    )}
                                    {r.saldo < 0 && (
                                      <Badge variant="blue-subtle">A favor {pesos(-r.saldo)}</Badge>
                                    )}
                                  </>
                                }
                              />
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
                            <TableCell>
                              <MetodoPagoSelect registro={r} anulado={false} />
                            </TableCell>
                            <TableCell>
                              <MontoEditable
                                registro={r}
                                monto={r.efectivo + r.transferencia}
                                tipo="cobro"
                                anulado={false}
                              />
                            </TableCell>
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
                                <MetodoPagoSelect registro={r} anulado={false} />
                              )}
                            </TableCell>
                            <TableCell>
                              <MontoEditable
                                registro={r}
                                monto={r.monto}
                                tipo={r.tipo}
                                anulado={Boolean(anulado)}
                              />
                            </TableCell>
                            <TableCell numeric>—</TableCell>
                          </>
                        )}

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
                </TableBody>
              </Table>
            </TableRoot>
          </div>
        )}
    </>
  );
}
