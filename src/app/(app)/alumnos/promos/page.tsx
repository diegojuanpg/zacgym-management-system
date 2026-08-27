import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { comoQuery } from "@/lib/query";
import { FiltrosLocales } from "@/hooks/use-navegacion";
import type { OpcionAlumno, OpcionProducto } from "@/components/alumnos/promo-modal";
import { PromoModal } from "@/components/alumnos/promo-modal";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "@/components/icons";
import { TablaPromos, type PromoFila } from "./tabla";

/**
 * La página trae los grupos y nada más: buscador y filtros de encabezado
 * trabajan sobre esa lista, en el navegador.
 */
export default async function PromosPage({ searchParams }: PageProps<"/alumnos/promos">) {
  await requireStaff();
  const params = await searchParams;

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

  // Los ids de cada grupo, agrupados de una sola pasada: la tabla los necesita
  // por promo para abrir el modal de edición.
  const integrantesDe: Record<string, string[]> = {};
  for (const i of enPromo ?? []) {
    (integrantesDe[i.promo_id] ??= []).push(i.alumno_id);
  }

  const query = comoQuery(params);

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

        <div className="ml-auto">
          <PromoModal alumnos={alumnos ?? []} productos={productos ?? []} />
        </div>
      </div>

      <FiltrosLocales key={query} inicial={query}>
        {/* integrantes es un array jsonb: overrideTypes lo deja a medio tipar. */}
        <TablaPromos
          promos={(promos ?? []) as PromoFila[]}
          alumnos={alumnos ?? []}
          productos={productos ?? []}
          integrantesDe={integrantesDe}
        />
      </FiltrosLocales>
    </main>
  );
}
