import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PromoModal,
  type OpcionAlumno,
  type OpcionProducto,
} from "@/components/alumnos/promo-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeftIcon, UsersIcon } from "@/components/icons";
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

interface PromoFila {
  id: string;
  nombre: string;
  activa: boolean;
  producto_id: string;
  producto: string;
  precio: number;
  cuantos: number;
  integrantes: string[];
}

export default async function PromosPage() {
  await requireStaff();

  const supabase = await createClient();
  const [{ data: promos }, { data: alumnos }, { data: productos }, { data: enPromo }] =
    await Promise.all([
      supabase
        .from("promos_detalle")
        .select("id, nombre, activa, producto_id, producto, precio, cuantos, integrantes")
        .order("nombre")
        .overrideTypes<PromoFila[]>(),
      supabase
        .from("alumnos")
        .select("id, nombre_completo")
        .limit(5000)
        .order("nombre_completo")
        .overrideTypes<OpcionAlumno[]>(),
      // Cualquier producto sirve de promo: el precio ya está en el catálogo.
      supabase
        .from("productos")
        .select("id, nombre, precio")
        .eq("activo", true)
        .order("nombre")
        .overrideTypes<OpcionProducto[]>(),
      supabase.from("promo_integrantes").select("promo_id, alumno_id"),
    ]);

  const lista = promos ?? [];
  const integrantesDe = (id: string) =>
    (enPromo ?? []).filter((i) => i.promo_id === id).map((i) => i.alumno_id);

  const alcanzados = new Set((enPromo ?? []).map((i) => i.alumno_id)).size;

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
        <h1 className="text-heading-20">Promos</h1>
        <p className="text-copy-14 text-[var(--ds-gray-900)]">
          {lista.length === 0
            ? "Ninguna todavía"
            : `${lista.length} ${lista.length === 1 ? "grupo" : "grupos"} · ${alcanzados} ${alcanzados === 1 ? "alumno" : "alumnos"}`}
        </p>

        <div className="ml-auto">
          <PromoModal alumnos={alumnos ?? []} productos={productos ?? []} />
        </div>
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="Todavía no hay promos"
          description="Una promo agrupa alumnos que pagan un precio distinto: la familia que viene junta, los amigos del turno noche. Al cobrarles, el mostrador propone el producto del grupo."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
          <TableRoot className="md:max-h-[calc(100vh-15rem)]">
            <Table aria-label="Promos">
              <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Promo</TableHead>
                  <TableHead>Por persona</TableHead>
                  <TableHead>Integrantes</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-center" />
                </TableRow>
              </TableHeader>
              <TableBody striped>
                {lista.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-[var(--ds-gray-1000)]">{p.nombre}</TableCell>
                    <TableCell>{p.producto}</TableCell>
                    <TableCell>{pesos(p.precio)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {(p.integrantes ?? []).length === 0 ? (
                        <span className="text-[var(--ds-gray-900)]">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5 text-copy-13 text-[var(--ds-gray-1000)]">
                          {(p.integrantes as string[]).map((nombre, i) => (
                            <span key={i}>{String(nombre)}</span>
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
                            integrantes: integrantesDe(p.id),
                          }}
                          alumnos={alumnos ?? []}
                          productos={productos ?? []}
                        />
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
