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
  const [{ data: productos }, { data: vendedores }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, precio, categoria, caja, stock, activo, contar_en_turno, vendedor_id")
      .order("nombre")
      .overrideTypes<Producto[]>(),
    supabase.from("empleados").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  const query = comoQuery(params);

  return (
    <FiltrosLocales key={query} inicial={query}>
      <TablaProductos productos={productos ?? []} vendedores={vendedores ?? []} />
    </FiltrosLocales>
  );
}
