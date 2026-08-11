import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { anularVenta } from "@/lib/ventas";
import { NuevaVentaModal } from "@/components/mostrador/nueva-venta-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Hoy en Buenos Aires, no en la zona del servidor. */
function hoyEnBuenosAires() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
}

interface VentaFila {
  id: string;
  cantidad: number;
  total: number;
  metodo: "efectivo" | "transferencia" | "fiado";
  creado_en: string;
  anulada_en: string | null;
  alumnos: { nombre_completo: string } | null;
  productos: { nombre: string } | null;
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
      .from("ventas")
      .select(
        "id, cantidad, total, metodo, creado_en, anulada_en, alumnos(nombre_completo), productos(nombre)",
      )
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

  const vivas = (ventas ?? []).filter((v) => !v.anulada_en);
  const totalPor = (metodo: VentaFila["metodo"]) =>
    vivas.filter((v) => v.metodo === metodo).reduce((suma, v) => suma + v.total, 0);

  const totales = [
    { etiqueta: "Efectivo", monto: totalPor("efectivo") },
    { etiqueta: "Transferencia", monto: totalPor("transferencia") },
    { etiqueta: "Fiado", monto: totalPor("fiado") },
    { etiqueta: "Cobrado", monto: totalPor("efectivo") + totalPor("transferencia") },
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
          <form className="flex items-end gap-2">
            <Input type="date" name="fecha" label="Día" defaultValue={dia} />
            <Button type="submit" variant="secondary">
              Ver
            </Button>
          </form>

          <NuevaVentaModal alumnos={alumnos ?? []} productos={productos ?? []} />
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {totales.map((t) => (
            <div key={t.etiqueta} className="rounded-lg border border-border px-4 py-3">
              <p className="text-label-13 text-muted-foreground">{t.etiqueta}</p>
              <p className="text-heading-20">{pesos(t.monto)}</p>
            </div>
          ))}
        </section>

        <TableRoot>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Alumno</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead numeric>Cant.</TableHead>
                <TableHead>Método</TableHead>
                <TableHead numeric>Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody striped>
              {(ventas ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <p className="py-10 text-center text-copy-14 text-muted-foreground">
                      No hay ventas cargadas este día.
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {(ventas ?? []).map((v) => (
                <TableRow key={v.id} className={v.anulada_en ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    {new Date(v.creado_en).toLocaleTimeString("es-AR", {
                      timeZone: ZONA,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>{v.alumnos?.nombre_completo}</TableCell>
                  <TableCell>{v.productos?.nombre}</TableCell>
                  <TableCell numeric>{v.cantidad}</TableCell>
                  <TableCell>
                    {v.anulada_en ? (
                      <Badge variant="red-subtle">anulada</Badge>
                    ) : (
                      <Badge variant={v.metodo === "fiado" ? "amber-subtle" : "gray-subtle"}>
                        {v.metodo}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell numeric>
                    <span className={v.anulada_en ? "line-through" : undefined}>
                      {pesos(v.total)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {!v.anulada_en && (
                      <form action={anular}>
                        <Button type="submit" variant="tertiary" size="sm">
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
      </main>
    </>
  );
}
