import { createClient } from "@/lib/supabase/server";
import { traerTodo } from "@/lib/traer-todo";
import { comoQuery } from "@/lib/query";
import { FiltrosLocales } from "@/hooks/use-navegacion";
import { TablaAlumnos, type FilaAlumno } from "./tabla";
import type { DiaConCheckins, SemanaConCheckins } from "@/components/barras-checkins";

/**
 * La página trae los alumnos y no hace nada más: filtrar, buscar y ordenar pasa
 * en el navegador, sobre esta misma lista. Antes cada tecla del buscador y cada
 * checkbox de un encabezado era otra vuelta al server para volver a bajar los
 * ~2000 y recortarlos con las mismas funciones.
 */
export default async function AlumnosPage({ searchParams }: PageProps<"/alumnos">) {
  const params = await searchParams;
  const supabase = await createClient();
  // Son ~2000 alumnos y PostgREST corta si no se le pide de a tandas.
  const todos = await traerTodo<FilaAlumno>(
    supabase
      .from("alumnos_cuenta")
      .select(
        "id, apellido, nombre, celular, email, nacimiento, edad, genero, vence, saldo, activo, ultima_actividad, sheet_id, dias_entrenamiento, rutina_semana, rutina_estado",
      )
      .order("apellido")
      .order("nombre"),
  );

  // Son ~240 filas, una por dia con actividad desde el 01/01/2026: entra entera
  // y el navegador arma con eso los dos modos del grafico.
  const [{ data: dias }, { data: semanas }, { data: revisar }] = await Promise.all([
    supabase.from("checkins_por_dia").select("dia, personas").order("dia"),
    supabase.from("checkins_por_semana").select("lunes, personas").order("lunes"),
    // Quiénes quedaron sin la semana que dejó la corrida del domingo. Sale de la
    // vista y no de esta lista: quién entrenó esa semana no está acá.
    supabase.from("alumnos_revisar_rutina").select("id"),
  ]);

  const query = comoQuery(params);

  return (
    <FiltrosLocales key={query} inicial={query}>
      <TablaAlumnos
        alumnos={todos}
        dias={(dias ?? []) as DiaConCheckins[]}
        semanas={(semanas ?? []) as SemanaConCheckins[]}
        revisar={(revisar ?? []).map((a) => a.id!)}
      />
    </FiltrosLocales>
  );
}
