import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { registrarVenta, registrarPago, crearAlumno } from "@/lib/acciones";
import { AppHeader } from "@/components/app-header";
import { AccionForm } from "@/components/accion-form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function MostradorPage() {
  const staff = await requireStaff();
  const supabase = await createClient();

  const [{ data: alumnos }, { data: productos }, { data: impagas }, { data: ultimas }] =
    await Promise.all([
      supabase.from("alumnos").select("id, nombre_completo").eq("activo", true).order("nombre_completo"),
      supabase.from("productos").select("id, nombre, tipo, precio, stock").eq("activo", true).order("tipo").order("nombre"),
      supabase.from("ventas_saldo").select("*").gt("saldo", 0).order("creado_en"),
      supabase.from("ventas_saldo").select("*").order("creado_en", { ascending: false }).limit(15),
    ]);

  const deudaTotal = (impagas ?? []).reduce((suma, v) => suma + v.saldo, 0);

  return (
    <>
      <AppHeader staff={staff} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 p-6">
        <section className="grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
          <div className="flex flex-col gap-4 rounded-xl border border-border p-5 material-menu">
            <h2 className="text-heading-16">Cargar venta</h2>
            <AccionForm accion={registrarVenta} enviar="Cargar" size="lg" limpiarAlOk className="flex flex-col gap-3">
              <Select name="alumno_id" label="Alumno" required placeholder="Elegí un alumno">
                {(alumnos ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre_completo}
                  </option>
                ))}
              </Select>
              <Select name="producto_id" label="Producto" required placeholder="Elegí un producto">
                {(productos ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {pesos(p.precio)}
                    {p.tipo !== "mensualidad" ? ` (stock ${p.stock})` : ""}
                  </option>
                ))}
              </Select>
              <Input name="cantidad" label="Cantidad" type="number" min={1} defaultValue={1} required />
              <Select name="metodo" label="Cómo paga" required defaultValue="efectivo">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="fiado">Fiado (queda debiendo)</option>
              </Select>
              <Input name="nota" label="Nota (opcional)" placeholder="" />
            </AccionForm>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-heading-16">Deudas abiertas</h2>
              <span className="text-copy-14 text-muted-foreground">
                {(impagas ?? []).length} sin cobrar · <strong className="text-foreground">{pesos(deudaTotal)}</strong>
              </span>
            </div>

            {(impagas ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-copy-14 text-muted-foreground">
                No hay nada pendiente de cobro.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {(impagas ?? []).map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="text-label-14">{v.alumno}</span>
                      <span className="text-copy-13 text-muted-foreground">
                        {v.cantidad}× {v.producto} · {hora(v.creado_en)}
                        {v.pagado > 0 ? ` · pagó ${pesos(v.pagado)} de ${pesos(v.total)}` : ""}
                      </span>
                    </div>
                    <AccionForm
                      accion={registrarPago}
                      enviar="Cobrar"
                      size="sm"
                      className="flex items-end gap-2"
                    >
                      <input type="hidden" name="venta_id" value={v.id} />
                      <Input
                        name="monto"
                        type="number"
                        min={1}
                        max={v.saldo}
                        defaultValue={v.saldo}
                        size="sm"
                        prefix="$"
                        aria-label={`Monto a cobrar de ${v.alumno}`}
                      />
                      <Select name="metodo" size="small" defaultValue="efectivo" aria-label="Método">
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                      </Select>
                    </AccionForm>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-heading-16">Últimos movimientos</h2>
          <TableRoot>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead numeric>Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody striped>
                {(ultimas ?? []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{hora(v.creado_en)}</TableCell>
                    <TableCell>{v.alumno}</TableCell>
                    <TableCell>
                      {v.cantidad}× {v.producto}
                    </TableCell>
                    <TableCell numeric>{pesos(v.total)}</TableCell>
                    <TableCell>
                      {v.saldo === 0 ? (
                        <Badge variant="green-subtle">Pagado</Badge>
                      ) : (
                        <Badge variant="amber-subtle">Debe {pesos(v.saldo)}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        </section>

        <section className="flex max-w-md flex-col gap-3 rounded-xl border border-border p-5">
          <h2 className="text-heading-16">¿Falta un alumno?</h2>
          <p className="text-copy-13 text-muted-foreground">
            Agregalo acá y aparece en el listado al toque.
          </p>
          <AccionForm accion={crearAlumno} enviar="Añadir alumno" variant="secondary" limpiarAlOk className="flex flex-col gap-3">
            <Input name="apellido" label="Apellido" required />
            <Input name="nombre" label="Nombre" required />
          </AccionForm>
        </section>
      </main>
    </>
  );
}
