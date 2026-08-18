import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TabsUrl } from "@/components/tabs-url";
import { ToggleUrl } from "@/components/toggle-url";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon } from "@/components/icons";
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
  });

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" });

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
  nota_cierre: string | null;
  responsables: string[];
  contados: number;
}

interface TurnoAbierto {
  id: string;
  abierto_en: string;
  caja_grande_inicial: number;
  caja_chica_inicial: number;
  caja_grande_esperada: number;
  caja_chica_esperada: number;
  responsables: string[];
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
  nota_cierre: string | null;
  responsables: string[];
  contados: number;
}

export default async function IncoherenciasPage({
  searchParams,
}: PageProps<"/incoherencias">) {
  await requireStaff();
  const { ver, cuadraron } = await searchParams;
  const vista = ver === "producto" ? "producto" : "turno";
  // Se ven todos salvo que pidan lo contrario: ?cuadraron=no deja solo lo malo.
  const verCuadraron = cuadraron !== "no";

  const supabase = await createClient();
  const [{ data: turnos }, { data: enCurso }, { data: diferencias }] = await Promise.all([
    supabase
      .from("turnos_cerrados")
      .select(
        "id, abierto_en, cerrado_en, caja_grande_inicial, caja_chica_inicial, caja_grande_final, caja_chica_final, dif_grande, dif_chica, nota_cierre, responsables, contados",
      )
      .order("cerrado_en", { ascending: false })
      .overrideTypes<TurnoCerrado[]>(),
    supabase
      .from("turno_actual")
      .select(
        "id, abierto_en, caja_grande_inicial, caja_chica_inicial, caja_grande_esperada, caja_chica_esperada, responsables",
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

  const cerrados = turnos ?? [];
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
            nota_cierre: null,
            responsables: enCurso.responsables as string[],
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
        nota_cierre: t.nota_cierre,
        responsables: t.responsables as string[],
        contados: t.contados,
      }),
    ),
  ];

  const noCuadro = (f: Fila) =>
    f.cerrado_en !== null &&
    ((f.dif_grande ?? 0) !== 0 || (f.dif_chica ?? 0) !== 0 || stockPorTurno.has(f.id));

  const conProblema = filas.filter(noCuadro);
  const visibles = verCuadraron ? filas : filas.filter((f) => noCuadro(f) || f.cerrado_en === null);

  // Por producto: el patrón. Una vez es un error de conteo; seis veces no.
  const porProducto = [
    ...difs
      .reduce((mapa, d) => {
        const actual = mapa.get(d.producto_id) ?? {
          producto: d.producto,
          precio: d.precio,
          veces: 0,
          faltaron: 0,
          sobraron: 0,
          ultimo: d.cerrado_en,
        };
        actual.veces += 1;
        if (d.diferencia < 0) actual.faltaron += -d.diferencia;
        else actual.sobraron += d.diferencia;
        mapa.set(d.producto_id, actual);
        return mapa;
      }, new Map<string, { producto: string; precio: number; veces: number; faltaron: number; sobraron: number; ultimo: string | null }>())
      .values(),
  ].sort((a, b) => b.faltaron * b.precio - a.faltaron * a.precio);

  const perdido = porProducto.reduce((suma, p) => suma + p.faltaron * p.precio, 0);
  const cajaPerdida = conProblema.reduce(
    (suma, t) => suma + Math.min(0, t.dif_grande ?? 0) + Math.min(0, t.dif_chica ?? 0),
    0,
  );

  const vistas = [
    { valor: "turno", nombre: "Por turno", cuantos: filas.length },
    { valor: "producto", nombre: "Por producto", cuantos: porProducto.length },
  ];

  return (
    <main className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-heading-20">Incoherencias</h1>
        <p className="text-copy-14 text-[var(--ds-gray-900)]">
          {cerrados.length} {cerrados.length === 1 ? "turno cerrado" : "turnos cerrados"}
          {conProblema.length === 0 ? (
            ", todos cuadraron"
          ) : (
            <>
              {" · "}
              <span className="text-[var(--ds-amber-900)]">
                {conProblema.length} con diferencias
              </span>
              {perdido > 0 && (
                <>
                  {" · "}
                  <span className="text-[var(--ds-red-900)]">{pesos(perdido)} en stock</span>
                </>
              )}
              {cajaPerdida < 0 && (
                <>
                  {" · "}
                  <span className="text-[var(--ds-red-900)]">{pesos(cajaPerdida)} en caja</span>
                </>
              )}
            </>
          )}
        </p>
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsUrl param="ver" valor={vista} vistas={vistas} />
        {vista === "turno" && conProblema.length > 0 && (
          <ToggleUrl param="cuadraron" etiqueta="Los que cuadraron" encendido={verCuadraron} />
        )}
      </div>

      {vista === "turno" ? (
        filas.length === 0 ? (
          <EmptyState
            icon={<AlertIcon />}
            title="Todavía no hubo ningún turno"
            description="Cuando se abra el primero, acá queda anotado con cuánto arrancó, con cuánto cerró y qué no coincidió."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
            <TableRoot className="md:max-h-[calc(100vh-17rem)]">
              <Table aria-label="Turnos">
                <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                  <TableRow>
                    <TableHead>Turno</TableHead>
                    <TableHead>A cargo</TableHead>
                    <TableHead>Cierre</TableHead>
                    <TableHead>Caja grande</TableHead>
                    <TableHead>Caja chica</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Nota</TableHead>
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
                        <TableCell className="text-[var(--ds-gray-1000)]">
                          {t.responsables.length > 0 ? (
                            t.responsables.join(", ")
                          ) : (
                            <span className="text-[var(--ds-gray-900)]">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {t.cerrado_en === null ? (
                            <Badge variant="blue-subtle">En curso</Badge>
                          ) : noCuadro(t) ? (
                            <Badge variant="red-subtle">Con diferencias</Badge>
                          ) : (
                            <Badge variant="green-subtle">Cuadró</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Caja de={t.grande[0]} a={t.grande[1]} dif={t.dif_grande} />
                        </TableCell>
                        <TableCell>
                          <Caja de={t.chica[0]} a={t.chica[1]} dif={t.dif_chica} />
                        </TableCell>
                        <TableCell>
                          {stock.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {stock.map((d) => (
                                <Badge
                                  key={`${d.producto_id}-${d.momento}`}
                                  variant={d.diferencia < 0 ? "red-subtle" : "amber-subtle"}
                                >
                                  {d.producto} {d.diferencia > 0 ? "+" : ""}
                                  {d.diferencia}
                                  {d.momento === "apertura" ? " (al abrir)" : ""}
                                </Badge>
                              ))}
                            </div>
                          ) : t.cerrado_en === null ? (
                            <span className="text-[var(--ds-gray-900)]">Sin contar</span>
                          ) : t.contados > 0 ? (
                            // Contar y que dé bien no es lo mismo que no contar:
                            // lo segundo no prueba nada y hay que poder verlo.
                            <span className="text-[var(--ds-gray-900)]">
                              {t.contados} {t.contados === 1 ? "producto" : "productos"}, sin
                              diferencias
                            </span>
                          ) : (
                            <span className="text-[var(--ds-amber-900)]">No se contó</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {t.nota_cierre ?? <span className="text-[var(--ds-gray-900)]">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableRoot>
          </div>
        )
      ) : porProducto.length === 0 ? (
        <EmptyState
          icon={<AlertIcon />}
          title="Ningún producto dio distinto"
          description="Todos los conteos coincidieron con lo que el sistema esperaba."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
          <TableRoot className="md:max-h-[calc(100vh-17rem)]">
            <Table aria-label="Productos que no cuadraron">
              <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Veces que no dio</TableHead>
                  <TableHead>Faltaron</TableHead>
                  <TableHead>Sobraron</TableHead>
                  <TableHead>Plata perdida</TableHead>
                  <TableHead>Última vez</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody striped>
                {porProducto.map((p) => (
                  <TableRow key={p.producto}>
                    <TableCell className="text-[var(--ds-gray-1000)]">{p.producto}</TableCell>
                    <TableCell>
                      {/* Repetirse es la señal: una vez es un error de conteo. */}
                      {p.veces >= 3 ? (
                        <Badge variant="red-subtle">{p.veces} veces</Badge>
                      ) : (
                        `${p.veces} ${p.veces === 1 ? "vez" : "veces"}`
                      )}
                    </TableCell>
                    <TableCell>
                      {p.faltaron > 0 ? (
                        <span className="text-[var(--ds-red-900)]">{p.faltaron}</span>
                      ) : (
                        <span className="text-[var(--ds-gray-900)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.sobraron > 0 ? (
                        <span className="text-[var(--ds-amber-900)]">{p.sobraron}</span>
                      ) : (
                        <span className="text-[var(--ds-gray-900)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.faltaron > 0 ? (
                        <span className="text-[var(--ds-red-900)]">
                          {pesos(p.faltaron * p.precio)}
                        </span>
                      ) : (
                        <span className="text-[var(--ds-gray-900)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.ultimo ? (
                        cuando(p.ultimo)
                      ) : (
                        <span className="text-[var(--ds-gray-900)]">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        </div>
      )}
    </main>
  );
}

/** Con cuánto arrancó la caja y con cuánto terminó, y lo que falte o sobre. */
function Caja({ de, a, dif }: { de: number; a: number | null; dif: number | null }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[var(--ds-gray-1000)] whitespace-nowrap">
        {pesos(de)} <span className="text-[var(--ds-gray-900)]">→</span>{" "}
        {a === null ? "—" : pesos(a)}
      </span>
      {dif !== null && dif !== 0 && (
        <span
          className={
            dif < 0
              ? "text-copy-13 text-[var(--ds-red-900)]"
              : "text-copy-13 text-[var(--ds-amber-900)]"
          }
        >
          {dif < 0 ? "Faltan" : "Sobran"} {pesos(dif)}
        </span>
      )}
    </div>
  );
}
