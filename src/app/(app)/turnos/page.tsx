import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FiltroColumna } from "@/components/filtro-columna";
import { MostrarMas, recortar } from "@/components/mostrar-mas";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ClockIcon } from "@/components/icons";
import { saltosEntreTurnos, type PorCaja } from "@/lib/caja";
import { rangoDe, comparador } from "@/lib/filtros";
import { traerTodo } from "@/lib/traer-todo";
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
const pesos = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;

const cuando = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** Un tramo de alguien adentro del turno. Vuelve a salir si entra dos veces. */
interface Tramo {
  empleado_id: string;
  nombre: string;
  desde: string;
  hasta: string | null;
}

interface TurnoCerrado {
  id: string;
  abierto_en: string;
  cerrado_en: string;
  caja_grande_inicial: number;
  caja_chica_inicial: number;
  caja_grande_final: number | null;
  caja_chica_final: number | null;
  dif_grande: number | null;
  dif_chica: number | null;
  responsables_detalle: Tramo[];
  contados: number;
}

interface TurnoAbierto {
  id: string;
  abierto_en: string;
  caja_grande_inicial: number;
  caja_chica_inicial: number;
  caja_grande_esperada: number;
  caja_chica_esperada: number;
  responsables_detalle: Tramo[];
}

interface DiferenciaStock {
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

/** Un turno para la tabla, este abierto o cerrado. */
interface Fila {
  id: string;
  abierto_en: string;
  cerrado_en: string | null;
  grande: [number, number | null];
  chica: [number, number | null];
  dif_grande: number | null;
  dif_chica: number | null;
  responsables_detalle: Tramo[];
  contados: number;
}

export default async function TurnosPage({
  searchParams,
}: PageProps<"/turnos">) {
  await requireStaff();
  const params = await searchParams;
  const { orden, fecha, cargo, cierre, grande, chica, producto, filas: cuantas } = params;
  // Un filtro se manda como el mismo parametro repetido: ?cargo=X&cargo=Y.
  const lista_ = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  // El rango se resuelve antes de consultar para que recorte en la base y no en
  // memoria: pedir tres años de turnos para mostrar una semana es traer de gusto.
  // Argentina no cambia de hora, asi que el -03:00 fijo alcanza.
  const rangoFecha = rangoDe(fecha);
  const desdeISO = rangoFecha.desde ? `${rangoFecha.desde}T00:00:00-03:00` : null;
  const hastaISO = rangoFecha.hasta ? `${rangoFecha.hasta}T23:59:59.999-03:00` : null;

  const supabase = await createClient();
  let qTurnos = supabase
    .from("turnos_cerrados")
    .select(
      "id, abierto_en, cerrado_en, caja_grande_inicial, caja_chica_inicial, caja_grande_final, caja_chica_final, dif_grande, dif_chica, responsables_detalle, contados",
    );
  if (desdeISO) qTurnos = qTurnos.gte("abierto_en", desdeISO);
  if (hastaISO) qTurnos = qTurnos.lte("abierto_en", hastaISO);

  const [turnos, { data: enCurso }, { data: diferencias }] = await Promise.all([
    // En tandas: sin esto PostgREST corta en max_rows y no avisa, y a tres o
    // cuatro turnos por dia ese techo llega solo.
    traerTodo<TurnoCerrado>(qTurnos.order("cerrado_en", { ascending: false })),
    supabase
      .from("turno_actual")
      .select(
        "id, abierto_en, caja_grande_inicial, caja_chica_inicial, caja_grande_esperada, caja_chica_esperada, responsables_detalle",
      )
      .maybeSingle()
      .overrideTypes<TurnoAbierto>(),
    supabase
      .from("diferencias_stock")
      .select(
        "turno_id, momento, producto_id, producto, precio, contado, esperado, diferencia, valor, cerrado_en",
      )
      .order("cerrado_en", { ascending: false })
      .overrideTypes<DiferenciaStock[]>(),
  ]);

  const cerrados = turnos;
  const difs = diferencias ?? [];

  const stockPorTurno = new Map<string, DiferenciaStock[]>();
  for (const d of difs) {
    stockPorTurno.set(d.turno_id, [...(stockPorTurno.get(d.turno_id) ?? []), d]);
  }

  // El turno abierto va primero: todavía no cerró, pero el saldo con el que
  // arrancó ya es parte de la cadena y sin él no se entiende de dónde salió el
  // inicial del siguiente.
  const filas: Fila[] = [
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
      }),
    ),
  ];

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

  const filtroCargo = lista_(cargo);
  const filtroCierre = lista_(cierre);
  const filtroProducto = lista_(producto);
  // La comparacion de las cajas es contra la diferencia, no contra el monto: en
  // esta pantalla lo que se busca es lo que no cuadro, no cuanta plata habia.
  const filtroGrande = comparador(grande);
  const filtroChica = comparador(chica);

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
    <main className="flex flex-1 flex-col gap-4">
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
                        etiqueta="Turno"
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
                    <TableHead>
                      <FiltroColumna etiqueta="A cargo" param="cargo" opciones={opcionesCargo} />
                    </TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="Cierre" param="cierre" opciones={opcionesCierre} />
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
                        etiqueta="Stock"
                        param="producto"
                        opciones={opcionesProducto}
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody striped>
                  {visibles.map((t) => {
                    const stock = stockPorTurno.get(t.id) ?? [];
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-[var(--ds-gray-1000)]">
                          {cuando(t.abierto_en)}
                          {t.cerrado_en && ` → ${hora(t.cerrado_en)}`}
                        </TableCell>
                        <TableCell>
                          <Responsables
                            tramos={t.responsables_detalle}
                            abierto={t.abierto_en}
                            cerrado={t.cerrado_en}
                          />
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
                            {alertasDe(t) > 0 && (
                              <span
                                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--ds-red-900)] text-[11px] font-medium tabular-nums text-white"
                                aria-label={`${alertasDe(t)} ${alertasDe(t) === 1 ? "problema" : "problemas"} en este turno`}
                              >
                                {alertasDe(t)}
                              </span>
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
                        <TableCell>
                          {stock.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {stock.map((d) => (
                                <Badge
                                  key={`${d.producto_id}-${d.momento}`}
                                  variant={d.diferencia < 0 ? "red-subtle" : "amber-subtle"}
                                >
                                  {d.diferencia > 0 ? "+" : ""}
                                  {d.diferencia} {d.producto}
                                  {d.momento === "apertura" ? " (al abrir)" : ""}
                                </Badge>
                              ))}
                            </div>
                          ) : t.cerrado_en !== null && t.contados === 0 && !sinCerrar(t) ? (
                            // Cerraron sin contar nada. No es "dio bien": no
                            // prueba nada, y por eso es lo unico que se avisa
                            // cuando no hay diferencias.
                            <span className="text-[var(--ds-amber-900)]">No se contó</span>
                          ) : null}
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

/**
 * Quién estuvo, y el horario solo del que no cubrió el turno entero.
 *
 * La jornada casi nunca coincide con el turno —se ficha una vez y adentro pasan
 * dos o tres turnos—, así que lo que se muestra es el pedazo que se solapa: de
 * cuándo a cuándo estuvo esa persona mientras el turno estaba abierto.
 */
function Responsables({
  tramos,
  abierto,
  cerrado,
}: {
  tramos: Tramo[];
  abierto: string;
  cerrado: string | null;
}) {
  if (tramos.length === 0) {
    return <span className="text-[var(--ds-amber-900)]">Nadie fichó</span>;
  }

  return (
    <div className="flex flex-col leading-tight">
      {tramos.map((r) => {
        // El solapamiento, no la jornada entera: el que entró antes de que
        // abriera el turno, adentro del turno estuvo desde que abrió.
        const entro = r.desde > abierto ? r.desde : null;
        const salio = cerrado !== null && r.hasta !== null && r.hasta < cerrado ? r.hasta : null;
        return (
          <span key={`${r.empleado_id}-${r.desde}`} className="whitespace-nowrap">
            <span className="text-[var(--ds-gray-1000)]">{r.nombre}</span>
            {(entro || salio) && (
              <span className="text-copy-13 text-[var(--ds-gray-900)]">
                {" "}
                {entro ? hora(entro) : ""}
                {salio ? ` → ${hora(salio)}` : ""}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
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
