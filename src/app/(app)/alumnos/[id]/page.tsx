import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DatosAlumno } from "@/components/alumnos/datos-alumno";
import { TabsUrl } from "@/components/tabs-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RelativeTimeCard } from "@/components/ui/relative-time-card";
import { ArrowLeftIcon } from "@/components/icons";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { capitalizar, fechaCorta } from "@/lib/utils";

const ZONA = "America/Argentina/Buenos_Aires";
const pesos = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;
const vacio = <span className="text-[var(--ds-gray-900)]">—</span>;

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Hoy en Buenos Aires, no en la zona del servidor. */
function hoyEnBuenosAires() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
}

/**
 * Cuánto del período ya pasó, de 0 a 100. Fuera del render: Date.now() no es
 * puro. Sin fecha de compra no hay período que medir.
 */
function avance(desde: string | null, hasta: string | null) {
  if (!desde || !hasta) return null;
  const arranque = new Date(desde).getTime();
  const fin = new Date(`${hasta}T23:59:59-03:00`).getTime();
  if (fin <= arranque) return 100;
  const pasado = ((Date.now() - arranque) / (fin - arranque)) * 100;
  return Math.min(100, Math.max(0, Math.round(pasado)));
}

/** Días que faltan para el vencimiento; negativo si ya pasó. */
function diasPara(hasta: string) {
  const fin = new Date(`${hasta}T23:59:59-03:00`).getTime();
  return Math.ceil((fin - Date.now()) / 86400000);
}

interface Ficha {
  id: string;
  apellido: string;
  nombre: string;
  celular: string | null;
  email: string | null;
  nacimiento: string | null;
  genero: "femenino" | "masculino" | "otro" | null;
  vence: string | null;
  activo: boolean;
  saldo: number;
  ultima_actividad: string | null;
  creado_en: string;
}

interface Compra {
  id: string;
  producto: string;
  categoria: string | null;
  cantidad: number;
  total: number;
  pagado: number;
  saldo: number;
  creado_en: string;
  anulada_en: string | null;
}

interface Tarea {
  id: string;
  categoria: string | null;
  detalle: string;
  creado_en: string;
}

export default async function FichaAlumnoPage({ params, searchParams }: PageProps<"/alumnos/[id]">) {
  await requireStaff();
  const { id } = await params;
  const { rubro } = await searchParams;
  const solapa = typeof rubro === "string" ? rubro : "todos";

  const supabase = await createClient();
  const { data: alumno } = await supabase
    .from("alumnos_cuenta")
    .select(
      "id, apellido, nombre, celular, email, nacimiento, genero, vence, activo, saldo, ultima_actividad, creado_en",
    )
    .eq("id", id)
    .maybeSingle<Ficha>();

  if (!alumno) notFound();

  const [{ data: compras }, { data: tareas }, { data: promo }] = await Promise.all([
    supabase
      .from("ventas_saldo")
      .select("id, producto, categoria, cantidad, total, pagado, saldo, creado_en, anulada_en")
      .eq("alumno_id", id)
      .order("creado_en", { ascending: false })
      .limit(200)
      .overrideTypes<Compra[]>(),
    supabase
      .from("tareas_detalle")
      .select("id, categoria, detalle, creado_en")
      .eq("alumno_id", id)
      .order("creado_en", { ascending: false })
      .overrideTypes<Tarea[]>(),
    supabase
      .from("alumno_promo")
      .select("promo, producto, precio")
      .eq("alumno_id", id)
      .maybeSingle<{ promo: string; producto: string; precio: number }>(),
  ]);

  const todas = compras ?? [];
  const rubroDe = (c: Compra) => c.categoria ?? "sin";
  const visibles = todas.filter((c) => solapa === "todos" || rubroDe(c) === solapa);

  // Los rubros son los de las compras del alumno: la lista del catálogo se
  // arma desde Productos y crece, así que acá no puede estar clavada.
  const categorias = [...new Set(todas.map((c) => c.categoria).filter((c) => c !== null))].sort(
    (a, b) => a.localeCompare(b, "es"),
  );

  const rubros = [
    { valor: "todos", nombre: "Todas" },
    ...categorias.map((c) => ({ valor: c, nombre: capitalizar(c) })),
    { valor: "sin", nombre: "Sin categoría" },
  ]
    .map((r) => ({
      ...r,
      cuantos: r.valor === "todos" ? todas.length : todas.filter((c) => rubroDe(c) === r.valor).length,
    }))
    // Una solapa vacía es un callejón sin salida: solo se muestran las que tienen algo.
    .filter((r) => r.cuantos > 0 || r.valor === "todos");

  const vencido = alumno.vence !== null && alumno.vence < hoyEnBuenosAires();
  const iniciales = `${alumno.nombre[0] ?? ""}${alumno.apellido[0] ?? ""}`.toUpperCase();

  // No hay un "plan" asignado al alumno: el que vale es el último que compró.
  // Se deduce de sus compras, así que si nunca compró una mensualidad no hay
  // plan que mostrar aunque tenga fecha de vencimiento cargada a mano.
  const mensualidad = todas.find((c) => c.categoria === "mensualidad" && !c.anulada_en) ?? null;
  const restante = alumno.vence === null ? null : diasPara(alumno.vence);

  return (
    <main className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          variant="tertiary"
          size="icon-sm"
          aria-label="Volver a Alumnos"
          nativeButton={false}
          render={<Link href="/alumnos" />}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <h1 className="text-heading-20">Ficha del alumno</h1>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className="text-heading-16 flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--ds-gray-alpha-200)] text-[var(--ds-gray-1000)]">
            {iniciales}
          </span>

          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-heading-24 truncate text-[var(--ds-gray-1000)]">
              {alumno.nombre} {alumno.apellido}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {alumno.activo ? (
                <Badge variant="blue">Activo</Badge>
              ) : (
                <Badge variant="red">Inactivo</Badge>
              )}
              {vencido && <Badge variant="red">Vencida</Badge>}
              {promo && <Badge variant="purple-subtle">{promo.promo}</Badge>}
            </div>
          </div>
        </div>

        {/* Mensualidad y vencimiento: lo primero que se pregunta en el mostrador. */}
        <div className="grid grid-cols-1 border-t border-[var(--ds-gray-alpha-400)] sm:grid-cols-2">
          <div className="flex flex-col gap-1 border-b border-[var(--ds-gray-alpha-400)] p-5 sm:border-r sm:border-b-0">
            <span className="text-copy-13 text-[var(--ds-gray-900)]">Mensualidad</span>
            {mensualidad ? (
              <>
                <span className="text-heading-16 text-[var(--ds-gray-1000)]">
                  {mensualidad.producto}
                </span>
                <span className="text-copy-13 text-[var(--ds-gray-900)]">
                  {pesos(mensualidad.total)} · {fecha(mensualidad.creado_en)}
                </span>
              </>
            ) : (
              <span className="text-heading-16 text-[var(--ds-gray-900)]">Sin mensualidad</span>
            )}
          </div>

          <div className="flex flex-col gap-1 p-5">
            <span className="text-copy-13 text-[var(--ds-gray-900)]">Vencimiento</span>
            {alumno.vence === null ? (
              <span className="text-heading-16 text-[var(--ds-gray-900)]">Sin fecha</span>
            ) : (
              <>
                <span
                  className={`text-heading-16 ${vencido ? "text-[var(--ds-red-900)]" : "text-[var(--ds-gray-1000)]"}`}
                >
                  {fechaCorta(alumno.vence)}
                </span>
                <span className="text-copy-13 text-[var(--ds-gray-900)]">
                  {restante === null
                    ? null
                    : restante < 0
                      ? `Venció hace ${-restante} ${-restante === 1 ? "día" : "días"}`
                      : restante === 0
                        ? "Vence hoy"
                        : `Faltan ${restante} ${restante === 1 ? "día" : "días"}`}
                </span>
                {/* La barra se llena a medida que se consume el período. */}
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ds-gray-alpha-300)]">
                  <div
                    className={`h-full rounded-full ${vencido ? "bg-[var(--ds-red-700)]" : "bg-[var(--ds-green-700)]"}`}
                    style={{
                      width: `${avance(mensualidad?.creado_en ?? null, alumno.vence) ?? 100}%`,
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden">
            <DatosAlumno
              alumno={{
                id: alumno.id,
                apellido: alumno.apellido,
                nombre: alumno.nombre,
                nacimiento: alumno.nacimiento,
                genero: alumno.genero,
                celular: alumno.celular,
                email: alumno.email,
                vence: alumno.vence,
                activo: alumno.activo,
              }}
              desde={fecha(alumno.creado_en)}
              ultimaActividad={
                alumno.ultima_actividad ? (
                  <RelativeTimeCard date={alumno.ultima_actividad} side="top">
                    <span>{fechaHora(alumno.ultima_actividad)}</span>
                  </RelativeTimeCard>
                ) : (
                  <span className="text-[var(--ds-gray-900)]">Nunca</span>
                )
              }
            />
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ds-gray-alpha-400)] px-5 py-3">
              <h2 className="text-heading-16">Compras</h2>
              {todas.length > 0 && (
                <TabsUrl param="rubro" valor={solapa} vistas={rubros} />
              )}
            </div>

            {visibles.length === 0 ? (
              <p className="text-copy-14 px-5 py-8 text-center text-[var(--ds-gray-900)]">
                {todas.length === 0
                  ? "Todavía no compró nada."
                  : "No compró nada de este rubro."}
              </p>
            ) : (
              <div className="px-3 py-2">
                <TableRoot>
                  <Table aria-label={`Compras de ${alumno.nombre} ${alumno.apellido}`}>
                    <TableHeader className="[&_th]:font-bold">
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Cant.</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Pagado</TableHead>
                        <TableHead>Debe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody striped>
                      {visibles.map((c) => (
                        <TableRow
                          key={c.id}
                          className={c.anulada_en ? "text-muted-foreground" : undefined}
                        >
                          <TableCell>{fechaHora(c.creado_en)}</TableCell>
                          <TableCell className="text-[var(--ds-gray-1000)]">
                            {c.producto}
                            {c.anulada_en && (
                              <Badge variant="red-subtle" className="ml-2">
                                anulada
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{c.cantidad}</TableCell>
                          <TableCell>
                            <span className={c.anulada_en ? "line-through" : undefined}>
                              {pesos(c.total)}
                            </span>
                          </TableCell>
                          <TableCell>{pesos(c.pagado)}</TableCell>
                          <TableCell>
                            {c.saldo > 0 && !c.anulada_en ? (
                              <span className="text-[var(--ds-red-900)]">{pesos(c.saldo)}</span>
                            ) : (
                              vacio
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableRoot>
              </div>
            )}
          </Card>
        </div>

        <div className="flex h-fit flex-col gap-4">
          {/* Chico y arriba de todo en la columna: es un dato, no un panel. */}
          <Card className="px-5 py-3">
            <span className="text-copy-13 text-[var(--ds-gray-900)]">Balance</span>
            <p className="text-heading-16 mt-0.5">
              {alumno.saldo > 0 ? (
                <span className="text-[var(--ds-red-900)]">Debe {pesos(alumno.saldo)}</span>
              ) : alumno.saldo < 0 ? (
                <span className="text-[var(--ds-green-900)]">A favor {pesos(-alumno.saldo)}</span>
              ) : (
                <span className="text-[var(--ds-gray-900)]">Al día</span>
              )}
            </p>
          </Card>

          <Card className="overflow-hidden">
            <h2 className="text-heading-16 border-b border-[var(--ds-gray-alpha-400)] px-5 py-4">
              Tareas
            </h2>
          {(tareas ?? []).length === 0 ? (
            <p className="text-copy-14 px-5 py-8 text-center text-[var(--ds-gray-900)]">
              Sin tareas para este alumno.
            </p>
          ) : (
            <ul className="flex flex-col">
              {(tareas ?? []).map((t) => (
                <li
                  key={t.id}
                  className="flex flex-col gap-1 border-b border-[var(--ds-gray-alpha-300)] px-5 py-3 last:border-b-0"
                >
                  <span className="text-copy-14 text-[var(--ds-gray-1000)]">{t.detalle}</span>
                  <span className="text-copy-13 flex items-center gap-2 text-[var(--ds-gray-900)]">
                    {t.categoria && <Badge variant="gray-subtle">{t.categoria}</Badge>}
                    {fechaHora(t.creado_en)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          </Card>
        </div>
      </div>
    </main>
  );
}
