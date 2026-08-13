import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { anularVenta, anularMovimiento } from "@/lib/ventas";
import { NuevaVentaModal } from "@/components/mostrador/nueva-venta-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectorDia } from "@/components/mostrador/selector-dia";
import { Card } from "@/components/ui/card";
import { Description } from "@/components/ui/description";
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

function nombreMetodo(efectivo: number, transferencia: number) {
  if (efectivo > 0 && transferencia > 0) return "Mixto";
  if (efectivo > 0) return "Efectivo";
  if (transferencia > 0) return "Transferencia";
  return "—";
}

/** Hoy en Buenos Aires, no en la zona del servidor. */
function hoyEnBuenosAires() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
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
  saldo: number;
  creado_en: string;
  anulada_en: string | null;
}

export default async function MostradorPage({ searchParams }: PageProps<"/mostrador">) {
  const staff = await requireStaff();
  const { fecha } = await searchParams;
  const dia =
    typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyEnBuenosAires();

  const supabase = await createClient();
  const desde = new Date(`${dia}T00:00:00-03:00`).toISOString();
  const hasta = new Date(`${dia}T00:00:00-03:00`);
  hasta.setDate(hasta.getDate() + 1);

  const [{ data: ventas }, { data: alumnos }, { data: productos }] = await Promise.all([
    supabase
      .from("ventas_saldo")
      .select("id, alumno, producto, cantidad, total, efectivo, transferencia, saldo, creado_en, anulada_en")
      .gte("creado_en", desde)
      .lt("creado_en", hasta.toISOString())
      .order("creado_en", { ascending: false })
      .overrideTypes<VentaFila[]>(),
    supabase
      .from("alumnos_cuenta")
      .select("id, nombre_completo, saldo")
      .eq("activo", true)
      .order("nombre_completo")
      .overrideTypes<{ id: string; nombre_completo: string; saldo: number }[]>(),
    supabase.from("productos").select("id, nombre, precio, stock").eq("activo", true).order("nombre"),
  ]);

  const { data: movimientos } = await supabase
    .from("movimientos_caja_detalle")
    .select("id, tipo, caja, metodo, monto, motivo, delta, creado_en, anulado_en")
    .gte("creado_en", desde)
    .lt("creado_en", hasta.toISOString())
    .order("creado_en", { ascending: false })
    .overrideTypes<MovimientoFila[]>();

  const { data: diasConVentas } = await supabase
    .from("dias_con_ventas")
    .select("dia")
    .order("dia", { ascending: false })
    .overrideTypes<{ dia: string }[]>();

  const vivas = (ventas ?? []).filter((v) => !v.anulada_en);
  const suma = (campo: "efectivo" | "transferencia" | "saldo") =>
    vivas.reduce((acumulado, v) => acumulado + v[campo], 0);

  // Deuda y a favor no se netean: son dos cosas distintas para el que cierra caja.
  const deuda = vivas.reduce((acumulado, v) => acumulado + Math.max(0, v.saldo), 0);
  const aFavor = vivas.reduce((acumulado, v) => acumulado + Math.max(0, -v.saldo), 0);

  const movimientosVivos = (movimientos ?? []).filter((m) => !m.anulado_en);
  const movidoEn = (metodo: "efectivo" | "transferencia") =>
    movimientosVivos
      .filter((m) => m.metodo === metodo)
      .reduce((acumulado, m) => acumulado + m.delta, 0);

  // Lo que deberia haber: lo que entro por ventas mas lo que se movio a mano.
  const totales = [
    { etiqueta: "En caja", monto: suma("efectivo") + movidoEn("efectivo") },
    { etiqueta: "Transferencias", monto: suma("transferencia") + movidoEn("transferencia") },
    { etiqueta: "Deuda", monto: deuda },
    { etiqueta: "A favor", monto: aFavor },
  ];

  type Registro =
    | ({ clase: "venta" } & VentaFila)
    | ({ clase: "movimiento" } & MovimientoFila);

  const registros: Registro[] = [
    ...(ventas ?? []).map((v) => ({ clase: "venta" as const, ...v })),
    ...(movimientos ?? []).map((m) => ({ clase: "movimiento" as const, ...m })),
  ].sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  async function anularMov(formData: FormData) {
    "use server";
    await anularMovimiento(String(formData.get("id")));
  }

  async function anular(formData: FormData) {
    "use server";
    await anularVenta(String(formData.get("id")));
  }

  async function cerrarSesion() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-heading-16">ZacGym</span>
          <span className="text-label-14 text-muted-foreground">Mostrador</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-copy-13 text-muted-foreground sm:inline">{staff.email}</span>
          <Badge variant={staff.role === "admin" ? "gray-subtle" : "blue-subtle"}>
            {staff.role}
          </Badge>
          <form action={cerrarSesion}>
            <Button type="submit" variant="secondary" size="sm">
              Salir
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SelectorDia dia={dia} dias={(diasConVentas ?? []).map((d) => d.dia)} />

          <NuevaVentaModal alumnos={alumnos ?? []} productos={productos ?? []} />
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {totales.map((t) => (
            <Card key={t.etiqueta}>
              <Description
                title={t.etiqueta}
                content={<span className="text-heading-20">{pesos(t.monto)}</span>}
              />
            </Card>
          ))}
        </section>

        {registros.length === 0 ? (
          <EmptyState
            icon={<CartIcon />}
            title="Sin movimientos este día"
            description="Cargá las ventas y los movimientos de caja con el botón de arriba y aparecen acá."
          />
        ) : (
          <div className="rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
            <TableRoot>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>Alumno</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead>Cant.</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead numeric>Total</TableHead>
                    <TableHead className="text-center" />
                  </TableRow>
                </TableHeader>
                <TableBody striped>
                  {registros.map((r) => {
                    const anulado = r.clase === "venta" ? r.anulada_en : r.anulado_en;
                    return (
                      <TableRow
                        key={`${r.clase}-${r.id}`}
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
                                nombreMetodo(r.efectivo, r.transferencia)
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
                          {!anulado && (
                            <form action={r.clase === "venta" ? anular : anularMov}>
                              <Button
                                type="submit"
                                variant="tertiary"
                                size="sm"
                                className="hover:bg-[var(--ds-red-200)] hover:text-[var(--ds-red-900)]"
                              >
                                Anular
                              </Button>
                              <input type="hidden" name="id" value={r.id} />
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
    </>
  );
}
