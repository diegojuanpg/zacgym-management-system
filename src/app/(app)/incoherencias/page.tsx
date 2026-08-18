import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TabsUrl } from "@/components/tabs-url";
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

interface TurnoCerrado {
  id: string;
  abierto_en: string;
  cerrado_en: string;
  dif_grande: number | null;
  dif_chica: number | null;
  nota_cierre: string | null;
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

export default async function IncoherenciasPage({
  searchParams,
}: PageProps<"/incoherencias">) {
  await requireStaff();
  const { ver } = await searchParams;
  const vista = ver === "producto" ? "producto" : "turno";

  const supabase = await createClient();
  const [{ data: turnos }, { data: diferencias }] = await Promise.all([
    supabase
      .from("turnos_cerrados")
      .select("id, abierto_en, cerrado_en, dif_grande, dif_chica, nota_cierre, responsables")
      .order("cerrado_en", { ascending: false })
      .overrideTypes<TurnoCerrado[]>(),
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

  // Un turno solo entra si algo no dio: la sección es para lo que no cuadró.
  const conProblema = cerrados.filter(
    (t) => t.dif_grande !== 0 || t.dif_chica !== 0 || stockPorTurno.has(t.id),
  );

  // Por producto: el patrón. Una vez es un error de conteo; seis veces no.
  const porProducto = [...
    difs
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
    { valor: "turno", nombre: "Por turno", cuantos: conProblema.length },
    { valor: "producto", nombre: "Por producto", cuantos: porProducto.length },
  ];

  return (
    <main className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-heading-20">Incoherencias</h1>
        <p className="text-copy-14 text-[var(--ds-gray-900)]">
          {conProblema.length === 0 ? (
            `${cerrados.length} ${cerrados.length === 1 ? "turno cerrado" : "turnos cerrados"}, todos cuadraron`
          ) : (
            <>
              {conProblema.length} de {cerrados.length}{" "}
              {cerrados.length === 1 ? "turno" : "turnos"} no cuadró
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

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsUrl param="ver" valor={vista} vistas={vistas} />
      </div>

      {cerrados.length === 0 ? (
        <EmptyState
          icon={<AlertIcon />}
          title="Todavía no cerró ningún turno"
          description="Cuando se cierre el primero, acá aparece lo que no coincidió entre lo contado y lo que el sistema esperaba."
        />
      ) : vista === "turno" ? (
        conProblema.length === 0 ? (
          <EmptyState
            icon={<AlertIcon />}
            title="Todo cuadró"
            description="Ningún turno cerrado tuvo diferencias de caja ni de stock."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
            <TableRoot className="md:max-h-[calc(100vh-17rem)]">
              <Table aria-label="Turnos que no cuadraron">
                <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                  <TableRow>
                    <TableHead>Turno</TableHead>
                    <TableHead>A cargo</TableHead>
                    <TableHead>Caja grande</TableHead>
                    <TableHead>Caja chica</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Nota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody striped>
                  {conProblema.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-[var(--ds-gray-1000)]">
                        {cuando(t.abierto_en)} → {cuando(t.cerrado_en)}
                      </TableCell>
                      <TableCell className="text-[var(--ds-gray-1000)]">
                        {t.responsables.join(", ")}
                      </TableCell>
                      <TableCell>
                        <Plata dif={t.dif_grande} />
                      </TableCell>
                      <TableCell>
                        <Plata dif={t.dif_chica} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(stockPorTurno.get(t.id) ?? []).map((d) => (
                            <Badge
                              key={`${d.producto_id}-${d.momento}`}
                              variant={d.diferencia < 0 ? "red-subtle" : "amber-subtle"}
                            >
                              {d.producto} {d.diferencia > 0 ? "+" : ""}
                              {d.diferencia}
                              {d.momento === "apertura" ? " (al abrir)" : ""}
                            </Badge>
                          ))}
                          {!stockPorTurno.has(t.id) && (
                            <span className="text-[var(--ds-gray-900)]">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {t.nota_cierre ?? <span className="text-[var(--ds-gray-900)]">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
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
                      {p.ultimo ? cuando(p.ultimo) : <span className="text-[var(--ds-gray-900)]">—</span>}
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

function Plata({ dif }: { dif: number | null }) {
  if (dif === null || dif === 0) return <span className="text-[var(--ds-gray-900)]">—</span>;
  return (
    <span className={dif < 0 ? "text-[var(--ds-red-900)]" : "text-[var(--ds-amber-900)]"}>
      {dif < 0 ? "Faltan" : "Sobran"} {pesos(dif)}
    </span>
  );
}
