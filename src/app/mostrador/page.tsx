import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { anularVenta } from "@/lib/ventas";
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
      .from("alumnos")
      .select("id, nombre_completo")
      .eq("activo", true)
      .order("nombre_completo"),
    supabase.from("productos").select("id, nombre, precio, stock").eq("activo", true).order("nombre"),
  ]);

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

  const totales = [
    { etiqueta: "Efectivo", monto: suma("efectivo") },
    { etiqueta: "Transferencia", monto: suma("transferencia") },
    { etiqueta: "Deuda", monto: deuda },
    { etiqueta: "A favor", monto: aFavor },
  ];

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

        {(ventas ?? []).length === 0 ? (
          <EmptyState
            icon={<CartIcon />}
            title="Sin ventas este día"
            description="Cargá las ventas del mostrador con el botón de arriba y aparecen acá."
          />
        ) : (
        <TableRoot>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Alumno</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Cant.</TableHead>
                <TableHead>Método</TableHead>
                <TableHead numeric>Pago</TableHead>
                <TableHead numeric>Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody striped>
              {(ventas ?? []).map((v) => (
                <TableRow key={v.id} className={v.anulada_en ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    {new Date(v.creado_en).toLocaleTimeString("es-AR", {
                      timeZone: ZONA,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>{v.alumno}</TableCell>
                  <TableCell>{v.producto}</TableCell>
                  <TableCell>{v.cantidad}</TableCell>
                  <TableCell>
                    {v.anulada_en ? (
                      <Badge variant="red-subtle">anulada</Badge>
                    ) : (
                      nombreMetodo(v.efectivo, v.transferencia)
                    )}
                  </TableCell>
                  <TableCell numeric>
                    <div className="flex items-center justify-end gap-2">
                      {pesos(v.efectivo + v.transferencia)}
                      {v.saldo > 0 && (
                        <Badge variant="amber-subtle">Debe {pesos(v.saldo)}</Badge>
                      )}
                      {v.saldo < 0 && (
                        <Badge variant="blue-subtle">A favor {pesos(-v.saldo)}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell numeric>
                    <span className={v.anulada_en ? "line-through" : undefined}>
                      {pesos(v.total)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {!v.anulada_en && (
                      <form action={anular}>
                        <Button
                          type="submit"
                          variant="tertiary"
                          size="sm"
                          className="hover:bg-[var(--ds-red-200)] hover:text-[var(--ds-red-900)]"
                        >
                          Anular
                        </Button>
                        <input type="hidden" name="id" value={v.id} />
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
        )}
      </main>
    </>
  );
}
