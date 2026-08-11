import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { anularVenta } from "@/lib/ventas";
import { NuevaVentaModal } from "@/components/mostrador/nueva-venta-modal";

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

export default async function MostradorPage({
  searchParams,
}: PageProps<"/mostrador">) {
  const staff = await requireStaff();
  const { fecha } = await searchParams;
  const dia = typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyEnBuenosAires();

  const supabase = await createClient();
  const desde = new Date(`${dia}T00:00:00-03:00`).toISOString();
  const hasta = new Date(`${dia}T00:00:00-03:00`);
  hasta.setDate(hasta.getDate() + 1);

  const [{ data: ventas }, { data: alumnos }, { data: productos }] = await Promise.all([
    supabase
      .from("ventas")
      .select("id, cantidad, total, metodo, creado_en, anulada_en, alumnos(nombre_completo), productos(nombre)")
      .gte("creado_en", desde)
      .lt("creado_en", hasta.toISOString())
      .order("creado_en", { ascending: false })
      .overrideTypes<VentaFila[]>(),
    supabase.from("alumnos").select("id, nombre_completo").eq("activo", true).order("nombre_completo"),
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
          <span className="text-base font-semibold">ZacGym</span>
          <span className="text-sm text-muted">Mostrador</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {staff.email} — {staff.role}
          </span>
          <form action={cerrarSesion}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-foreground/5"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <form className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Día
              <input
                type="date"
                name="fecha"
                defaultValue={dia}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-foreground/5"
            >
              Ver
            </button>
          </form>

          <NuevaVentaModal alumnos={alumnos ?? []} productos={productos ?? []} />
        </div>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {totales.map((t) => (
            <div key={t.etiqueta} className="rounded-lg border border-border px-4 py-3">
              <p className="text-xs text-muted">{t.etiqueta}</p>
              <p className="text-lg font-semibold">{pesos(t.monto)}</p>
            </div>
          ))}
        </section>

        <section className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-normal">Hora</th>
                <th className="px-4 py-2 font-normal">Alumno</th>
                <th className="px-4 py-2 font-normal">Producto</th>
                <th className="px-4 py-2 text-right font-normal">Cant.</th>
                <th className="px-4 py-2 font-normal">Método</th>
                <th className="px-4 py-2 text-right font-normal">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(ventas ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No hay ventas cargadas este día.
                  </td>
                </tr>
              )}
              {(ventas ?? []).map((v) => (
                <tr
                  key={v.id}
                  className={`border-b border-border last:border-0 ${v.anulada_en ? "text-muted line-through" : ""}`}
                >
                  <td className="px-4 py-2">
                    {new Date(v.creado_en).toLocaleTimeString("es-AR", {
                      timeZone: ZONA,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2">{v.alumnos?.nombre_completo}</td>
                  <td className="px-4 py-2">{v.productos?.nombre}</td>
                  <td className="px-4 py-2 text-right">{v.cantidad}</td>
                  <td className="px-4 py-2 capitalize">{v.metodo}</td>
                  <td className="px-4 py-2 text-right">{pesos(v.total)}</td>
                  <td className="px-4 py-2 text-right">
                    {!v.anulada_en && (
                      <form action={anular}>
                        <input type="hidden" name="id" value={v.id} />
                        <button type="submit" className="text-xs text-muted hover:text-red-600">
                          Anular
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
