"use client";

import Link from "next/link";
import { ProductoModal, type Producto } from "@/components/productos/producto-modal";
import { useParametros } from "@/hooks/use-navegacion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Buscador } from "@/components/buscador";
import { FiltroColumna } from "@/components/filtro-columna";
import { TabsUrl } from "@/components/tabs-url";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeftIcon, CartIcon } from "@/components/icons";
import { capitalizar } from "@/lib/utils";
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

/** La tabla del catálogo: solapas por rubro, buscador y filas. */
export function TablaProductos({ productos: todos }: { productos: Producto[] }) {
  const parametros = useParametros();
  const busqueda = (parametros.get("q") ?? "").trim();
  const rubro = parametros.get("cat") ?? "todos";

  // "sin" son los que todavía nadie clasificó; en la base eso es null.
  const esDe = (p: Producto, r: string) =>
    r === "todos" || (r === "sin" ? p.categoria === null : p.categoria === r);

  // Lo que muestra cada columna, que es también lo que se tilda en su filtro:
  // el filtro compara contra el texto que se ve, no contra el valor de la base.
  const categoriaDe = (p: Producto) => (p.categoria === null ? "Sin categoría" : capitalizar(p.categoria));
  const cajaDe = (p: Producto) => (p.caja === null ? "Sin asignar" : capitalizar(p.caja));
  const conteoDe = (p: Producto) => (p.contar_en_turno ? "En turno" : "No se cuenta");
  const estadoDe = (p: Producto) => (p.activo ? "Activo" : "Oculto");

  const filtroCategoria = parametros.getAll("categoria");
  const filtroCaja = parametros.getAll("caja");
  const filtroConteo = parametros.getAll("conteo");
  const filtroEstado = parametros.getAll("estado");

  // 60 filas: filtrar acá sale más barato que ir de nuevo a la base por cada rubro.
  const catalogo = todos.filter(
    (p) =>
      esDe(p, rubro) &&
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
      (filtroCategoria.length === 0 || filtroCategoria.includes(categoriaDe(p))) &&
      (filtroCaja.length === 0 || filtroCaja.includes(cajaDe(p))) &&
      (filtroConteo.length === 0 || filtroConteo.includes(conteoDe(p))) &&
      (filtroEstado.length === 0 || filtroEstado.includes(estadoDe(p))),
  );

  // Las opciones salen del catálogo entero y no de lo ya filtrado: si salieran
  // de lo filtrado, destildar una opción la haría desaparecer de su propio panel.
  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesCategoria = ordenar(todos.map(categoriaDe));
  const opcionesCaja = ordenar(todos.map(cajaDe));
  const opcionesConteo = ordenar(todos.map(conteoDe));
  const opcionesEstado = ordenar(todos.map(estadoDe));

  // Los rubros salen del catálogo y no de una lista fija: se cargan desde el
  // alta, así que el que inventaron ayer tiene que tener su solapa hoy.
  const categorias = [...new Set(todos.map((p) => p.categoria).filter((c) => c !== null))].sort(
    (a, b) => a.localeCompare(b, "es"),
  );

  const rubros = [
    { valor: "todos", nombre: "Todos" },
    ...categorias.map((c) => ({ valor: c, nombre: c })),
    { valor: "sin", nombre: "Sin categoría" },
  ].map((r) => ({ ...r, cuantos: todos.filter((p) => esDe(p, r.valor)).length }));


  return (
    <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-2">
          {/* render: el botón del sistema se dibuja como link, sin anidar <a><button>.
              nativeButton en false para que Base UI no espere un <button> real. */}
          <Button
            variant="tertiary"
            size="icon-sm"
            aria-label="Volver al mostrador"
            title="Volver al mostrador"
            nativeButton={false}
            render={<Link href="/mostrador" />}
          >
            <ArrowLeftIcon />
          </Button>
          <h1 className="text-heading-20">Productos</h1>
        </div>

        {/* El rubro vive en la URL, igual que la búsqueda. Solapas a la
            izquierda; alta y buscador a la derecha, en el mismo renglón. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="-mx-4 min-w-0 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsUrl
              param="cat"
              valor={rubro}
              vistas={rubros.map((r) => ({ ...r, nombre: capitalizar(r.nombre) }))}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ProductoModal categorias={categorias} />
            <Buscador inicial={busqueda} placeholder="Buscar producto..." />
          </div>
        </div>

        {catalogo.length === 0 ? (
          <EmptyState
            icon={<CartIcon />}
            title={todos.length === 0 ? "El catálogo está vacío" : "Ningún producto coincide"}
            description={
              todos.length === 0
                ? "Cargá el primer producto con el botón de arriba."
                : "Probá con otro nombre o sacá los filtros de los encabezados."
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
                    <TableHead>
                      <FiltroColumna
                        etiqueta="Categoría"
                        param="categoria"
                        opciones={opcionesCategoria}
                      />
                    </TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="Caja" param="caja" opciones={opcionesCaja} />
                    </TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="Conteo" param="conteo" opciones={opcionesConteo} />
                    </TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="Estado" param="estado" opciones={opcionesEstado} />
                    </TableHead>
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
                          <span className="capitalize">{p.categoria}</span>
                        )}
                      </TableCell>
                      {/* Sin caja lo tienen los 60 productos viejos: un badge por
                          fila pintaba la tabla entera de ámbar y dejaba de avisar
                          nada. Para juntarlos está el filtro del encabezado. */}
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
                        <ProductoModal producto={p} categorias={categorias} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableRoot>
          </div>
        )}
    </div>
  );
}
