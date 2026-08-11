import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  crearProducto,
  borrarProducto,
  crearAlumno,
  borrarAlumno,
  crearUsuario,
} from "@/lib/acciones";
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

interface Producto {
  id: string;
  nombre: string;
  tipo: "mensualidad" | "consumible" | "suplemento";
  precio: number;
  meses_equivale: number | null;
  stock: number;
  activo: boolean;
}

function TablaProductos({ items, conStock }: { items: Producto[]; conStock: boolean }) {
  return (
    <TableRoot>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead numeric>Precio</TableHead>
            <TableHead numeric>{conStock ? "Stock" : "Meses"}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody striped>
          {items.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                {p.nombre}
                {!p.activo && (
                  <Badge variant="red-subtle" className="ml-2">
                    inactivo
                  </Badge>
                )}
              </TableCell>
              <TableCell numeric>{pesos(p.precio)}</TableCell>
              <TableCell numeric>{conStock ? p.stock : (p.meses_equivale ?? 1)}</TableCell>
              <TableCell>
                <AccionForm accion={borrarProducto} enviar="Eliminar" variant="error" size="sm">
                  <input type="hidden" name="id" value={p.id} />
                </AccionForm>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableRoot>
  );
}

export default async function ConfiguracionPage() {
  const staff = await requireStaff();
  if (staff.role !== "admin") redirect("/");

  const supabase = await createClient();
  const [{ data: productos }, { data: alumnos }] = await Promise.all([
    supabase.from("productos").select("*").order("tipo").order("nombre"),
    supabase.from("alumnos").select("id, nombre_completo, activo").order("nombre_completo"),
  ]);

  const porTipo = (tipo: Producto["tipo"]) =>
    ((productos ?? []) as Producto[]).filter((p) => p.tipo === tipo);

  return (
    <>
      <AppHeader staff={staff} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 p-6">
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-heading-20">Productos</h2>
            <p className="text-copy-14 text-muted-foreground">
              Consumibles y suplementos. El stock baja solo con cada venta.
            </p>
          </div>
          <AccionForm
            accion={crearProducto}
            enviar="Agregar"
            limpiarAlOk
            className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
          >
            <Input name="nombre" label="Nombre" required className="min-w-48" />
            <Select name="tipo" label="Tipo" defaultValue="consumible">
              <option value="consumible">Consumible</option>
              <option value="suplemento">Suplemento</option>
            </Select>
            <Input name="precio" label="Precio" type="number" min={0} required prefix="$" />
            <Input name="stock" label="Stock" type="number" min={0} defaultValue={0} />
          </AccionForm>
          <TablaProductos items={[...porTipo("consumible"), ...porTipo("suplemento")]} conStock />
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-heading-20">Mensualidades y pases</h2>
            <p className="text-copy-14 text-muted-foreground">
              Los meses son cuánto cubre cada pase: Cuota 1, Bronce 3, Plata 6, Oro 12.
            </p>
          </div>
          <AccionForm
            accion={crearProducto}
            enviar="Agregar"
            limpiarAlOk
            className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
          >
            <input type="hidden" name="tipo" value="mensualidad" />
            <Input name="nombre" label="Nombre" required className="min-w-48" />
            <Input name="precio" label="Precio" type="number" min={0} required prefix="$" />
            <Input
              name="meses_equivale"
              label="Meses que cubre"
              type="number"
              min={1}
              defaultValue={1}
            />
          </AccionForm>
          <TablaProductos items={porTipo("mensualidad")} conStock={false} />
        </section>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-heading-20">Listado de alumnos</h2>
            <p className="text-copy-14 text-muted-foreground">
              {(alumnos ?? []).length} cargados. Los de arranque son temporales hasta importar el
              listado real.
            </p>
          </div>
          <AccionForm
            accion={crearAlumno}
            enviar="Añadir alumno"
            limpiarAlOk
            className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4"
          >
            <Input name="apellido" label="Apellido" required />
            <Input name="nombre" label="Nombre" required />
          </AccionForm>
          <TableRoot>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alumno</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody striped>
                {(alumnos ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {a.nombre_completo}
                      {!a.activo && (
                        <Badge variant="red-subtle" className="ml-2">
                          inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <AccionForm accion={borrarAlumno} enviar="Eliminar" variant="error" size="sm">
                        <input type="hidden" name="id" value={a.id} />
                      </AccionForm>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        </section>

        <section className="flex max-w-md flex-col gap-4">
          <div>
            <h2 className="text-heading-20">Usuarios del sistema</h2>
            <p className="text-copy-14 text-muted-foreground">
              Cuentas para entrar a la app. Admin ve la configuración; employee solo el mostrador.
            </p>
          </div>
          <AccionForm
            accion={crearUsuario}
            enviar="Crear cuenta"
            limpiarAlOk
            className="flex flex-col gap-3 rounded-lg border border-border p-4"
          >
            <Input name="email" label="Email" type="email" required />
            <Input name="password" label="Contraseña" type="password" minLength={8} required />
            <Select name="rol" label="Rol" defaultValue="employee">
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </Select>
          </AccionForm>
        </section>
      </main>
    </>
  );
}
