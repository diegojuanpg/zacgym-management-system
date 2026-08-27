"use client";

import { comparador } from "@/lib/filtros";
import { Buscador } from "@/components/buscador";
import { FiltroColumna } from "@/components/filtro-columna";
import {
  PromoModal,
  type OpcionAlumno,
  type OpcionProducto,
} from "@/components/alumnos/promo-modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { UsersIcon } from "@/components/icons";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { useParametros } from "@/hooks/use-navegacion";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

export interface PromoFila {
  id: string;
  nombre: string;
  activa: boolean;
  producto_id: string;
  producto: string;
  precio: number;
  cuantos: number;
  integrantes: string[];
}

/**
 * La tabla de Promos: buscador y filtros de encabezado, igual que Ventas y
 * Tareas. Recibe los grupos y de ahí en más filtra sola, en el navegador: son
 * un puñado de filas y ninguna consulta vale la pena.
 */
export function TablaPromos({
  promos: todas,
  alumnos,
  productos,
  integrantesDe,
}: {
  promos: PromoFila[];
  alumnos: OpcionAlumno[];
  productos: OpcionProducto[];
  /** Los ids de cada grupo, para abrir el modal de edición. */
  integrantesDe: Record<string, string[]>;
}) {
  const parametros = useParametros();
  const q = parametros.get("q") ?? "";
  const busqueda = q.trim().toLowerCase();
  const lista_ = (nombre: string) => parametros.getAll(nombre);

  const estadoDe = (p: PromoFila) => (p.activa ? "Activa" : "Pausada");

  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesGrupo = ordenar(todas.map((p) => p.nombre));
  const opcionesProducto = ordenar(todas.map((p) => p.producto));
  const opcionesEstado = ordenar(todas.map(estadoDe));

  const filtroGrupo = lista_("grupo");
  const filtroProducto = lista_("promo");
  const filtroEstado = lista_("estado");
  const filtroPrecio = comparador(parametros.get("precio") ?? undefined);

  const promos = todas.filter(
    (p) =>
      (filtroGrupo.length === 0 || filtroGrupo.includes(p.nombre)) &&
      (filtroProducto.length === 0 || filtroProducto.includes(p.producto)) &&
      (filtroEstado.length === 0 || filtroEstado.includes(estadoDe(p))) &&
      (filtroPrecio === null || filtroPrecio(p.precio)) &&
      // La búsqueda entra también por integrante: es cómo se encuentra el grupo
      // de alguien cuando no te acordás cómo se llamaba el grupo.
      (busqueda === "" ||
        `${p.nombre} ${p.producto} ${(p.integrantes ?? []).join(" ")}`
          .toLowerCase()
          .includes(busqueda)),
  );

  const alcanzados = new Set(
    promos.flatMap((p) => integrantesDe[p.id] ?? []),
  ).size;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-copy-14 text-[var(--ds-gray-900)]">
          {todas.length === 0
            ? "Ninguna todavía"
            : `${promos.length === todas.length ? promos.length : `${promos.length} de ${todas.length}`} ${
                promos.length === 1 ? "grupo" : "grupos"
              } · ${alcanzados} ${alcanzados === 1 ? "alumno" : "alumnos"}`}
        </p>

        <Buscador inicial={q} placeholder="Buscar grupo, promo o integrante..." />
      </div>

      {promos.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={todas.length === 0 ? "Todavía no hay promos" : "Nada coincide"}
          description={
            todas.length === 0
              ? "Una promo agrupa alumnos que pagan un precio distinto: la familia que viene junta, los amigos del turno noche. Al cobrarles, el mostrador propone el producto del grupo."
              : "Probá con otra búsqueda o sacá los filtros de los encabezados."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
          <TableRoot className="md:max-h-[calc(100vh-15rem)]">
            <Table aria-label="Promos">
              <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                <TableRow>
                  <TableHead>
                    <FiltroColumna etiqueta="Grupo" param="grupo" opciones={opcionesGrupo} />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Promo" param="promo" opciones={opcionesProducto} />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Por persona" monto={{ param: "precio" }} />
                  </TableHead>
                  <TableHead>Integrantes</TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Estado" param="estado" opciones={opcionesEstado} />
                  </TableHead>
                  <TableHead className="text-center" />
                </TableRow>
              </TableHeader>
              <TableBody striped>
                {promos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-[var(--ds-gray-1000)]">{p.nombre}</TableCell>
                    <TableCell>{p.producto}</TableCell>
                    <TableCell>{pesos(p.precio)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {(p.integrantes ?? []).length === 0 ? (
                        <span className="text-[var(--ds-gray-900)]">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5 text-copy-13 text-[var(--ds-gray-1000)]">
                          {p.integrantes.map((nombre, i) => (
                            <span key={i}>{nombre}</span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.activa ? (
                        <Badge variant="blue">Activa</Badge>
                      ) : (
                        <Badge variant="gray-subtle">Pausada</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <PromoModal
                        promo={{
                          id: p.id,
                          nombre: p.nombre,
                          producto_id: p.producto_id,
                          activa: p.activa,
                          integrantes: integrantesDe[p.id] ?? [],
                        }}
                        alumnos={alumnos}
                        productos={productos}
                      />
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
