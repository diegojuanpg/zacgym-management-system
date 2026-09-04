import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { comoQuery } from "@/lib/query";
import { FiltrosLocales } from "@/hooks/use-navegacion";
import type { Corrida } from "@/lib/pipelines";
import { TablaPipelines, TOPE_LINEAS, type Linea } from "./tabla";

/**
 * Cómo vienen andando los pipelines de Apps Script.
 *
 * Las corridas salen de `pipeline_ultima` —una fila por pipeline— y los logs de
 * `pipeline_lineas`, que es la tabla cruda con los nombres nuevos puestos.
 *
 * Con `?run=` se trae esa corrida entera, que es lo que pasa al hacer click en
 * una fila de arriba; sin eso, las últimas líneas de todos. Por eso `run` es un
 * parámetro de servidor y el resto de los filtros se resuelven en el navegador.
 */
export default async function PipelinesPage({ searchParams }: PageProps<"/pipelines">) {
  await requireStaff();
  const params = await searchParams;
  const run = typeof params.run === "string" ? params.run : undefined;

  const supabase = await createClient();
  const columnas = "id, run_id, pipeline, nivel, alumno_id, gmail, mensaje, contexto, created_at";
  const [{ data: ultimas }, { data: lineas }] = await Promise.all([
    supabase.from("pipeline_ultima").select("*"),
    run
      ? supabase
          .from("pipeline_lineas")
          .select(columnas)
          .eq("run_id", run)
          .order("created_at", { ascending: false })
      : supabase
          .from("pipeline_lineas")
          .select(columnas)
          .order("created_at", { ascending: false })
          // ponytail: las últimas y nada más. La tabla crece unas cien líneas
          // por día y el resto de la app filtra en el navegador igual que acá;
          // el día que el tope estorbe, los filtros de la consola pasan al
          // server.
          .limit(TOPE_LINEAS),
  ]);

  const query = comoQuery(params);

  return (
    <FiltrosLocales key={query} inicial={query} servidor={["run"]}>
      <TablaPipelines
        ultimas={(ultimas ?? []) as Corrida[]}
        lineas={(lineas ?? []) as Linea[]}
        run={run}
      />
    </FiltrosLocales>
  );
}
