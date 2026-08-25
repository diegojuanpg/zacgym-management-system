import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { traerTodo } from "@/lib/traer-todo";
import { comoQuery } from "@/lib/query";
import { FiltrosLocales } from "@/hooks/use-navegacion";
import { TablaTareas, type Tarea } from "./tabla";

/**
 * Las tareas del gimnasio. La página las trae y nada más: solapas, buscador y
 * filtros de encabezado trabajan sobre esa lista, en el navegador.
 */
export default async function TareasPage({ searchParams }: PageProps<"/tareas">) {
  await requireStaff();
  const params = await searchParams;

  const supabase = await createClient();
  const [todas, { data: categorias }] = await Promise.all([
    traerTodo<Tarea>(
      supabase
        .from("tareas_detalle")
        .select("id, alumno_id, alumno, categoria, detalle, creado_en, estado")
        .order("creado_en", { ascending: false }),
    ),
    // Todas las categorías, incluso las que todavía no tiene ninguna tarea: la
    // solapa vacía dice que la categoría existe, que es distinto de no existir.
    supabase.from("tarea_categorias").select("nombre").order("nombre"),
  ]);

  const query = comoQuery(params);

  return (
    <FiltrosLocales key={query} inicial={query}>
      <TablaTareas tareas={todas} categorias={(categorias ?? []).map((c) => c.nombre)} />
    </FiltrosLocales>
  );
}
