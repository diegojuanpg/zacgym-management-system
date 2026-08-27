"use client";

import { FiltroColumna } from "@/components/filtro-columna";
import { MostrarMas } from "@/components/mostrar-mas";
import { recortar } from "@/lib/recorte";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ClockIcon } from "@/components/icons";
import type { Alumno, Producto } from "@/components/mostrador/nueva-venta-modal";
import {
  DetalleTurno,
  type DesgloseCaja,
  type ProductoContado,
} from "@/components/turnos/detalle-turno";
import { saltosEntreTurnos, type PorCaja } from "@/lib/caja";
import { rangoDe, comparador } from "@/lib/filtros";
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
const ZONA = "America/Argentina/Buenos_Aires";
const pesos = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
  });

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** Un tramo de alguien adentro del turno. Vuelve a salir si entra dos veces. */
export interface Tramo {
  empleado_id: string;
  nombre: string;
  desde: string;
  hasta: string | null;
}

export interface TurnoCerrado {
  id: string;
  abierto_en: string;
  cerrado_en: string;
  caja_grande_inicial: number;
  caja_chica_inicial: number;
  caja_grande_final: number | null;
  caja_chica_final: number | null;
  caja_grande_esperada: number;
  caja_chica_esperada: number;
  dif_grande: number | null;
  dif_chica: number | null;
  responsables_detalle: Tramo[];
  contados: number;
  ventas_grande: number;
  ventas_chica: number;
  movimientos_grande: number;
  movimientos_chica: number;
  nota_cierre: string | null;
  corregido_en: string | null;
}

export interface TurnoAbierto {
  id: string;
  abierto_en: string;
  caja_grande_inicial: number;
  caja_chica_inicial: number;
  caja_grande_esperada: number;
  caja_chica_esperada: number;
  ventas_grande: number;
  ventas_chica: number;
  movimientos_grande: number;
  movimientos_chica: number;
  responsables_detalle: Tramo[];
}

export interface DiferenciaStock {
  turno_id: string;
  momento: "apertura" | "cierre";
  producto_id: string;
  producto: string;
  precio: number;
  contado: number;
  esperado: number;
  diferencia: number;
  valor: number;
  cerrado_en: string | null;
}

/** Una fila de `turno_stock`: lo que se conto de un producto en un momento. */
export interface ConteoStock {
  turno_id: string;
  momento: string;
  contado: number;
  esperado: number;
  producto_id: string;
  productos: { nombre: string } | null;
}

/** Un turno para la tabla, este abierto o cerrado. */
export interface Fila {
  id: string;
  abierto_en: string;
  cerrado_en: string | null;
  grande: [number, number | null];
  chica: [number, number | null];
  dif_grande: number | null;
  dif_chica: number | null;
  responsables_detalle: Tramo[];
  contados: number;
  /** De dónde sale lo que tenía que haber en cada cajón, para el detalle. */
  desglose: { grande: DesgloseCaja; chica: DesgloseCaja };
  nota_cierre: string | null;
  corregido_en: string | null;
}

/** La tabla de turnos: el abierto arriba, los cerrados abajo, con sus filtros. */
export function TablaTurnos({
  cerrados,
  enCurso,
  diferencias,
  conteos,
  vendidas,
  alumnos,
  productos,
}: {
  cerrados: TurnoCerrado[];
  enCurso: TurnoAbierto | null;
  diferencias: DiferenciaStock[];
  conteos: ConteoStock[];
  vendidas: { turno_id: string; producto_id: string; cantidad: number }[];
  alumnos: Alumno[];
  productos: Producto[];
}) {
  const parametros = useParametros();
  const params = comoObjeto(parametros);
  const orden = parametros.get("orden") ?? undefined;
  const cuantas = parametros.get("filas") ?? undefined;
  const lista_ = (nombre: string) => parametros.getAll(nombre);
  // El rango de fechas ya recortó en la base; se vuelve a mirar acá solo por el
  // turno abierto, que sale de otra consulta y no pasa por ese filtro.
  const rangoFecha = rangoDe(parametros.get("fecha") ?? undefined);

  const difs = diferencias;

  // Lo contado de cada producto, de la apertura al cierre. El que dio bien
  // entra igual: el detalle muestra el recorrido del stock, no solo lo que
  // fallo.
  const vendidasPorTurno = new Map<string, number>();
  for (const v of vendidas) {
    const clave = `${v.turno_id}|${v.producto_id}`;
    vendidasPorTurno.set(clave, (vendidasPorTurno.get(clave) ?? 0) + v.cantidad);
  }

  const conteosPorTurno = new Map<string, ProductoContado[]>();
  for (const c of conteos) {
    const nombre = c.productos?.nombre ?? "—";
    const suyos = conteosPorTurno.get(c.turno_id) ?? [];
    const item = suyos.find((p) => p.producto === nombre) ?? {
      id: c.producto_id,
      producto: nombre,
      vendidas: vendidasPorTurno.get(`${c.turno_id}|${c.producto_id}`) ?? 0,
    };
    if (c.momento === "apertura") item.apertura = { contado: c.contado, esperado: c.esperado };
    else item.cierre = { contado: c.contado, esperado: c.esperado };
    conteosPorTurno.set(c.turno_id, [...suyos.filter((p) => p.producto !== nombre), item]);
  }
  for (const [id, items] of conteosPorTurno) {
    conteosPorTurno.set(id, [...items].sort((a, b) => a.producto.localeCompare(b.producto, "es")));
  }

  const stockPorTurno = new Map<string, DiferenciaStock[]>();
  for (const d of difs) {
    stockPorTurno.set(d.turno_id, [...(stockPorTurno.get(d.turno_id) ?? []), d]);
  }

  // El turno abierto va primero: todavía no cerró, pero el saldo con el que
  // arrancó ya es parte de la cadena y sin él no se entiende de dónde salió el
  // inicial del siguiente.
  const crudas: Fila[] = [
    ...(enCurso
      ? [
          {
            id: enCurso.id,
            abierto_en: enCurso.abierto_en,
            cerrado_en: null,
            grande: [enCurso.caja_grande_inicial, enCurso.caja_grande_esperada] as [number, number],
            chica: [enCurso.caja_chica_inicial, enCurso.caja_chica_esperada] as [number, number],
            dif_grande: null,
            dif_chica: null,
            responsables_detalle: enCurso.responsables_detalle,
            contados: 0,
            desglose: {
              grande: {
                inicial: enCurso.caja_grande_inicial,
                ventas: enCurso.ventas_grande,
                movimientos: enCurso.movimientos_grande,
                esperado: enCurso.caja_grande_esperada,
                contado: null,
              },
              chica: {
                inicial: enCurso.caja_chica_inicial,
                ventas: enCurso.ventas_chica,
                movimientos: enCurso.movimientos_chica,
                esperado: enCurso.caja_chica_esperada,
                contado: null,
              },
            },
            nota_cierre: null,
            corregido_en: null,
          },
        ]
      : []),
    ...cerrados.map(
      (t): Fila => ({
        id: t.id,
        abierto_en: t.abierto_en,
        cerrado_en: t.cerrado_en,
        grande: [t.caja_grande_inicial, t.caja_grande_final],
        chica: [t.caja_chica_inicial, t.caja_chica_final],
        dif_grande: t.dif_grande,
        dif_chica: t.dif_chica,
        responsables_detalle: t.responsables_detalle,
        contados: t.contados,
        desglose: {
          grande: {
            inicial: t.caja_grande_inicial,
            ventas: t.ventas_grande,
            movimientos: t.movimientos_grande,
            esperado: t.caja_grande_esperada,
            contado: t.caja_grande_final,
          },
          chica: {
            inicial: t.caja_chica_inicial,
            ventas: t.ventas_chica,
            movimientos: t.movimientos_chica,
            esperado: t.caja_chica_esperada,
            contado: t.caja_chica_final,
          },
        },
        nota_cierre: t.nota_cierre,
        corregido_en: t.corregido_en,
      }),
    ),
  ];

  // El horario del turno es cuando se apretaron los botones. El check-in ya no
  // pregunta a que hora arranca cada uno —lo toma del momento en que fichan—,
  // asi que no hay un "declarado" que mostrar en su lugar.
  const filas: Fila[] = crudas;


  // Lo que cada turno declaro al abrir de mas o de menos contra el cierre del
  // anterior. Solo entre turnos del mismo dia: de un dia para el otro la
  // recaudacion a veces se levanta y no siempre queda cargada como egreso, asi
  // que comparar contra el cierre de ayer marcaria un salto casi cada mañana.
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });
  const saltos = new Map<string, PorCaja>();
  for (const dia of new Set(filas.map((f) => diaDe(f.abierto_en)))) {
    const delDia = filas
      .filter((f) => diaDe(f.abierto_en) === dia)
      .map((f) => ({
        id: f.id,
        abierto_en: f.abierto_en,
        caja_grande_inicial: f.grande[0],
        caja_chica_inicial: f.chica[0],
        caja_grande_final: f.grande[1],
        caja_chica_final: f.chica[1],
      }));
    for (const [id, salto] of saltosEntreTurnos(delDia)) saltos.set(id, salto);
  }

  /** El turno cerro pero nadie conto la caja: lo cerro el sistema a medianoche. */
  const sinCerrar = (f: Fila) =>
    f.cerrado_en !== null && f.grande[1] === null && f.chica[1] === null;

  // Una alerta por cada cosa que salio mal, igual que en el separador del
  // Mostrador: cada caja descuadrada, cada salto de apertura y cada producto.
  const alertasDe = (f: Fila) =>
    ((f.dif_grande ?? 0) !== 0 ? 1 : 0) +
    ((f.dif_chica ?? 0) !== 0 ? 1 : 0) +
    (saltos.get(f.id)?.grande ? 1 : 0) +
    (saltos.get(f.id)?.chica ? 1 : 0) +
    (stockPorTurno.get(f.id)?.length ?? 0);

  const noCuadro = (f: Fila) => f.cerrado_en !== null && alertasDe(f) > 0;

  // ============================== filtros ==============================
  // Los mismos que en Ventas, adaptados: los encabezados filtran y ordenan, y
  // el estado vive en la URL.

  const estadoDe = (f: Fila) =>
    f.cerrado_en === null
      ? "En curso"
      : sinCerrar(f)
        ? "No cerraron"
        : noCuadro(f)
          ? "Con diferencias"
          : "Cerró bien";

  const nombresDe = (f: Fila) => f.responsables_detalle.map((r) => r.nombre);
  const productosDe = (f: Fila) => (stockPorTurno.get(f.id) ?? []).map((d) => d.producto);

  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesCargo = ordenar(filas.flatMap(nombresDe));
  const opcionesCierre = ordenar(filas.map(estadoDe));
  const opcionesProducto = ordenar(filas.flatMap(productosDe));

  const filtroCargo = lista_("cargo");
  const filtroCierre = lista_("cierre");
  const filtroProducto = lista_("producto");
  // La comparacion de las cajas es contra la diferencia, no contra el monto: en
  // esta pantalla lo que se busca es lo que no cuadro, no cuanta plata habia.
  const filtroGrande = comparador(parametros.get("grande") ?? undefined);
  const filtroChica = comparador(parametros.get("chica") ?? undefined);

  const lista = filas
    .filter(
      (f) =>
        // Un turno entra si alguno de los suyos esta elegido: la fila es de
        // varias personas, no de una.
        (filtroCargo.length === 0 || nombresDe(f).some((n) => filtroCargo.includes(n))) &&
        (filtroCierre.length === 0 || filtroCierre.includes(estadoDe(f))) &&
        (filtroProducto.length === 0 ||
          productosDe(f).some((p) => filtroProducto.includes(p))) &&
        // Los cerrados ya vienen recortados de la base; esto queda por el turno
        // abierto, que sale de otra consulta y no pasa por ese filtro.
        (rangoFecha.desde === "" || diaDe(f.abierto_en) >= rangoFecha.desde) &&
        (rangoFecha.hasta === "" || diaDe(f.abierto_en) <= rangoFecha.hasta) &&
        (filtroGrande === null || filtroGrande(f.dif_grande)) &&
        (filtroChica === null || filtroChica(f.dif_chica)),
    )
    .sort((a, b) =>
      orden === "antiguo"
        ? a.abierto_en.localeCompare(b.abierto_en)
        : b.abierto_en.localeCompare(a.abierto_en),
    );

  // Son pocos hoy, pero entra un turno por vez y no para: la tabla se recorta
  // igual que Alumnos y Tareas.
  const { tope, visibles } = recortar(lista, cuantas);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-heading-20">Turnos</h1>

      {lista.length === 0 ? (
          <EmptyState
            icon={<ClockIcon />}
            title={filas.length === 0 ? "Todavía no hubo ningún turno" : "Nada coincide"}
            description={
              filas.length === 0
                ? "Cuando se abra el primero, acá queda anotado con cuánto arrancó, con cuánto cerró y qué no coincidió."
                : "Probá quitando los filtros de los encabezados."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
            <TableRoot className="md:max-h-[calc(100vh-17rem)]">
              <Table aria-label="Turnos">
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
                        rango={{ param: "fecha", tipo: "date" }}
                      />
                    </TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Cierre</TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="A cargo" param="cargo" opciones={opcionesCargo} />
                    </TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="Estado" param="cierre" opciones={opcionesCierre} />
                    </TableHead>
                    <TableHead>
                      {/* La comparación es contra la diferencia: acá se busca lo
                          que no cuadró, no cuánta plata había. */}
                      <FiltroColumna etiqueta="Caja grande" monto={{ param: "grande" }} />
                    </TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="Caja chica" monto={{ param: "chica" }} />
                    </TableHead>
                    <TableHead>
                      <FiltroColumna
                        etiqueta="Alertas"
                        param="producto"
                        opciones={opcionesProducto}
                      />
                    </TableHead>
                    <TableHead className="text-center" />
                  </TableRow>
                </TableHeader>
                <TableBody striped>
                  {visibles.map((t) => {
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-[var(--ds-gray-1000)]">
                          {fecha(t.abierto_en)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-[var(--ds-gray-1000)]">
                          {hora(t.abierto_en)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-[var(--ds-gray-1000)]">
                          {t.cerrado_en === null ? (
                            <span className="text-[var(--ds-gray-900)]">—</span>
                          ) : (
                            hora(t.cerrado_en)
                          )}
                        </TableCell>
                        <TableCell>
                          <Responsables tramos={t.responsables_detalle} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {t.cerrado_en === null ? (
                              <Badge variant="blue-subtle">En curso</Badge>
                            ) : sinCerrar(t) ? (
                              // Nadie conto la caja: no cuadro ni dejo de cuadrar.
                              <Badge variant="amber-subtle">No cerraron</Badge>
                            ) : noCuadro(t) ? (
                              <Badge variant="red-subtle">Con diferencias</Badge>
                            ) : (
                              <Badge variant="green-subtle">Cerró bien</Badge>
                            )}

                          </div>
                        </TableCell>
                        <TableCell>
                          <Caja
                            de={t.grande[0]}
                            a={t.grande[1]}
                            dif={t.dif_grande}
                            salto={saltos.get(t.id)?.grande ?? 0}
                          />
                        </TableCell>
                        <TableCell>
                          <Caja
                            de={t.chica[0]}
                            a={t.chica[1]}
                            dif={t.dif_chica}
                            salto={saltos.get(t.id)?.chica ?? 0}
                          />
                        </TableCell>
                        {/* Cuantas cosas no cuadran: las dos cajas, los saltos
                            entre turnos y cada producto con diferencia. El
                            detalle esta en Ver, que es donde se puede leer. */}
                        <TableCell>
                          {alertasDe(t) > 0 ? (
                            <span className="flex size-6 items-center justify-center rounded-full bg-[var(--ds-red-200)] text-[13px] font-medium tabular-nums text-[var(--ds-red-900)]">
                              {alertasDe(t)}
                            </span>
                          ) : t.cerrado_en !== null && t.contados === 0 && !sinCerrar(t) ? (
                            // Cerraron sin contar nada. No es "dio bien": no
                            // prueba nada, y por eso se avisa igual.
                            <span className="text-[var(--ds-amber-900)]">No se contó</span>
                          ) : (
                            <span className="text-[var(--ds-gray-900)]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <DetalleTurno
                            id={t.id}
                            dia={new Date(t.abierto_en).toLocaleDateString("en-CA", {
                              timeZone: ZONA,
                            })}
                            desde={hora(t.abierto_en)}
                            hasta={t.cerrado_en ? hora(t.cerrado_en) : "23:59"}
                            alumnos={alumnos}
                            productos={productos}
                            corregido={t.corregido_en}
                            cuando={`${fecha(t.abierto_en)}, ${hora(t.abierto_en)}${
                              t.cerrado_en ? ` → ${hora(t.cerrado_en)}` : ""
                            }`}
                            abierto={t.cerrado_en === null}
                            grande={t.desglose.grande}
                            chica={t.desglose.chica}
                            stock={conteosPorTurno.get(t.id) ?? []}
                            nota={t.nota_cierre}
                            responsables={
                              <Responsables tramos={t.responsables_detalle} />
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <MostrarMas
                    ruta="/turnos"
                    params={params}
                    tope={tope}
                    enPagina={visibles.length}
                    total={lista.length}
                    columnas={9}
                  />
                </TableBody>
              </Table>
            </TableRoot>
          </div>
      )}

    </div>
  );
}

/**
 * Quiénes estuvieron en el turno. Solo los nombres: el horario de cada uno es
 * de la persona, no del turno, y en una lista de diez filas convertía cada
 * renglón en cuatro.
 */
function Responsables({ tramos }: { tramos: Tramo[] }) {
  if (tramos.length === 0) {
    return <span className="text-[var(--ds-amber-900)]">Nadie fichó</span>;
  }

  // Sin repetir: el que se fue y volvió el mismo turno es una sola persona.
  const nombres = [...new Set(tramos.map((r) => r.nombre))];
  return <span className="text-[var(--ds-gray-1000)]">{nombres.join(", ")}</span>;
}

/**
 * Con cuánto arrancó la caja y con cuánto terminó, y abajo lo que no cuadra.
 *
 * Sobrar va en rojo igual que faltar, como en el separador del Mostrador: los
 * dos significan que la plata no es la que el sistema puede explicar.
 */
function Caja({
  de,
  a,
  dif,
  salto,
}: {
  de: number;
  a: number | null;
  dif: number | null;
  /** Lo que declaró al abrir de más o de menos contra el cierre del anterior. */
  salto: number;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[var(--ds-gray-1000)] whitespace-nowrap">
        {pesos(de)} <span className="text-[var(--ds-gray-900)]">→</span>{" "}
        {a === null ? "—" : pesos(a)}
      </span>
      {dif !== null && dif !== 0 && (
        <span className="text-copy-13 text-[var(--ds-red-900)]">
          {dif < 0 ? "Faltan" : "Sobran"} {pesos(dif)}
        </span>
      )}
      {salto !== 0 && (
        <span className="text-copy-13 text-[var(--ds-red-900)]">
          Abrió con {pesos(salto)} de {salto < 0 ? "menos" : "más"}
        </span>
      )}
    </div>
  );
}
