import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProductoModal, type Producto } from "@/components/productos/producto-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Buscador } from "@/components/buscador";
import { TabsUrl } from "@/components/tabs-url";
import { EmptyState } from "@/components/ui/empty-state";
import { CartIcon, InvoiceIcon } from "@/components/icons";
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

const NOMBRE_RUBRO = {
  mensualidad: "Mensualidad",
  consumible: "Consumible",
  suplemento: "Suplemento",
} as const;

export default async function ProductosPage({ searchParams }: PageProps<"/productos">) {
  await requireStaff();
  const { q, cat } = await searchParams;
  const busqueda = typeof q === "string" ? q.trim() : "";
  const rubro = typeof cat === "string" ? cat : "todos";

  const supabase = await createClient();
  const { data: productos } = await supabase
    .from("productos")
    .select("id, nombre, precio, categoria, caja, stock, activo, contar_en_turno")
    .order("nombre")
    .overrideTypes<Producto[]>();

  const todos = productos ?? [];
  // "sin" son los que todavía nadie clasificó; en la base eso es null.
  const esDe = (p: Producto, r: string) =>
    r === "todos" || (r === "sin" ? p.categoria === null : p.categoria === r);

  // 60 filas: filtrar acá sale más barato que ir de nuevo a la base por cada rubro.
  const catalogo = todos.filter(
    (p) => esDe(p, rubro) && p.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );
  const sinCaja = catalogo.filter((p) => p.caja === null).length;

  const rubros = [
    { valor: "todos", nombre: "Todos" },
    { valor: "mensualidad", nombre: "Mensualidades" },
    { valor: "consumible", nombre: "Consumibles" },
    { valor: "suplemento", nombre: "Suplementos" },
    { valor: "sin", nombre: "Sin categoría" },
  ].map((r) => ({ ...r, cuantos: todos.filter((p) => esDe(p, r.valor)).length }));

  const enNegativo = catalogo.filter((p) => p.stock !== null && p.stock < 0).length;

  return (
    <main className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-heading-20">Productos</h1>
          <p className="text-copy-14 text-[var(--ds-gray-900)]">
            {catalogo.length === todos.length
              ? `${todos.length} en el catálogo`
              : `${catalogo.length} de ${todos.length} en el catálogo`}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Buscador inicial={busqueda} placeholder="Buscar producto..." />

          <div className="flex items-center gap-2">
            {/* render: el botón del sistema se dibuja como link, sin anidar <a><button>.
                nativeButton en false para que Base UI no espere un <button> real. */}
            <Button
              variant="secondary"
              prefix={<InvoiceIcon />}
              nativeButton={false}
              render={<Link href="/mostrador" />}
            >
              Mostrador
            </Button>
            <ProductoModal />
          </div>
        </div>

        {/* El rubro vive en la URL, igual que la búsqueda. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsUrl
            param="cat"
            valor={rubro}
            vistas={rubros.map((r) => ({ valor: r.valor, nombre: r.nombre, cuantos: r.cuantos }))}
          />
        </div>

        {(sinCaja > 0 || enNegativo > 0) && busqueda === "" && (
          <div className="flex flex-col gap-1 text-copy-14 text-[var(--ds-gray-900)]">
            {sinCaja > 0 && (
              <p>
                {sinCaja} {sinCaja === 1 ? "producto sigue" : "productos siguen"} sin caja
                asignada. Su efectivo se cuenta en la caja grande hasta que los edites.
              </p>
            )}
            {enNegativo > 0 && (
              <p className="text-[var(--ds-red-900)]">
                {enNegativo} {enNegativo === 1 ? "producto quedó" : "productos quedaron"} con stock
                en negativo: se vendieron más unidades de las que había cargadas.
              </p>
            )}
          </div>
        )}

        {catalogo.length === 0 ? (
          <EmptyState
            icon={<CartIcon />}
            title={busqueda === "" ? "El catálogo está vacío" : "Ningún producto coincide"}
            description={
              busqueda === ""
                ? "Cargá el primer producto con el botón de arriba."
                : "Probá con otro nombre."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
            {/* 60 filas: sin encabezado clavado, a la mitad de la lista ya no se
                sabe si esa columna es stock o precio. */}
            <TableRoot className="md:max-h-[calc(100vh-19rem)]">
              <Table aria-label="Catálogo de productos">
                <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Caja</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Conteo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead numeric>Precio</TableHead>
                    <TableHead className="text-center" />
                  </TableRow>
                </TableHeader>
                <TableBody striped>
                  {catalogo.map((p) => (
                    <TableRow key={p.id} className={p.activo ? undefined : "text-muted-foreground"}>
                      <TableCell>{p.nombre}</TableCell>
                      <TableCell>
                        {p.categoria === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          NOMBRE_RUBRO[p.categoria]
                        )}
                      </TableCell>
                      {/* Sin caja lo tienen los 60 productos viejos: un badge por
                          fila pintaba la tabla entera de ámbar y dejaba de avisar
                          nada. El aviso está arriba, una sola vez. */}
                      <TableCell>
                        {p.caja === null ? (
                          <span className="text-[var(--ds-gray-900)]">Sin asignar</span>
                        ) : (
                          <span className="capitalize">{p.caja}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.stock === null ? (
                          <span className="text-[var(--ds-gray-900)]">No se controla</span>
                        ) : p.stock < 0 ? (
                          // Negativo = se vendio mas de lo cargado. Un "-3" pelado
                          // se lee como un stock cualquiera y nadie lo repone.
                          <Badge variant="red-subtle">Faltan {-p.stock}</Badge>
                        ) : p.stock === 0 ? (
                          <Badge variant="amber-subtle">Sin stock</Badge>
                        ) : (
                          p.stock
                        )}
                      </TableCell>
                      {/* Lo que hay que contar a mano en cada apertura y cierre. */}
                      <TableCell>
                        {p.contar_en_turno ? (
                          <Badge variant="blue-subtle">En turno</Badge>
                        ) : (
                          <span className="text-[var(--ds-gray-900)]">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.activo ? "Activo" : <Badge variant="gray-subtle">Oculto</Badge>}
                      </TableCell>
                      <TableCell numeric>{pesos(p.precio)}</TableCell>
                      <TableCell className="text-center">
                        <ProductoModal producto={p} />
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
