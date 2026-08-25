import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { comoQuery } from "@/lib/query";
import { FiltrosLocales } from "@/hooks/use-navegacion";
import type { Producto } from "@/components/productos/producto-modal";
import { TablaProductos } from "./tabla";

/**
 * El catálogo entero, que son unas decenas de filas: buscar y cambiar de rubro
 * pasa en el navegador.
 */
export default async function ProductosPage({ searchParams }: PageProps<"/productos">) {
  await requireStaff();
  const params = await searchParams;

  const supabase = await createClient();
  const { data: productos } = await supabase
    .from("productos")
    .select("id, nombre, precio, categoria, caja, stock, activo, contar_en_turno")
    .order("nombre")
    .overrideTypes<Producto[]>();

  const query = comoQuery(params);

  return (
    <FiltrosLocales key={query} inicial={query}>
      <TablaProductos productos={productos ?? []} />
    </FiltrosLocales>
  );
}
