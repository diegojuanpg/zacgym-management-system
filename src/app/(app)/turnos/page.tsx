import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rangoDe } from "@/lib/filtros";
import { traerTodo } from "@/lib/traer-todo";
import { comoQuery } from "@/lib/query";
import { FiltrosLocales } from "@/hooks/use-navegacion";
import {
  TablaTurnos,
  type TurnoCerrado,
  type TurnoAbierto,
  type DiferenciaStock,
} from "./tabla";

/**
 * Los turnos, con el rango de fechas resuelto en la base. Los filtros de los
 * encabezados trabajan después sobre lo que ya llegó, en el navegador.
 */
export default async function TurnosPage({ searchParams }: PageProps<"/turnos">) {
  await requireStaff();
  const params = await searchParams;
  const { fecha } = params;

  // El rango se resuelve antes de consultar para que recorte en la base y no en
  // memoria: pedir tres años de turnos para mostrar una semana es traer de gusto.
  // Argentina no cambia de hora, asi que el -03:00 fijo alcanza.
  const rangoFecha = rangoDe(fecha);
  const desdeISO = rangoFecha.desde ? `${rangoFecha.desde}T00:00:00-03:00` : null;
  const hastaISO = rangoFecha.hasta ? `${rangoFecha.hasta}T23:59:59.999-03:00` : null;

  const supabase = await createClient();
  let qTurnos = supabase
    .from("turnos_cerrados")
    .select(
      "id, abierto_en, cerrado_en, caja_grande_inicial, caja_chica_inicial, caja_grande_final, caja_chica_final, dif_grande, dif_chica, responsables_detalle, contados",
    );
  if (desdeISO) qTurnos = qTurnos.gte("abierto_en", desdeISO);
  if (hastaISO) qTurnos = qTurnos.lte("abierto_en", hastaISO);

  const [turnos, { data: enCurso }, { data: diferencias }] = await Promise.all([
    // En tandas: sin esto PostgREST corta en max_rows y no avisa, y a tres o
    // cuatro turnos por dia ese techo llega solo.
    traerTodo<TurnoCerrado>(qTurnos.order("cerrado_en", { ascending: false })),
    supabase
      .from("turno_actual")
      .select(
        "id, abierto_en, caja_grande_inicial, caja_chica_inicial, caja_grande_esperada, caja_chica_esperada, responsables_detalle",
      )
      .maybeSingle()
      .overrideTypes<TurnoAbierto>(),
    supabase
      .from("diferencias_stock")
      .select(
        "turno_id, momento, producto_id, producto, precio, contado, esperado, diferencia, valor, cerrado_en",
      )
      .order("cerrado_en", { ascending: false })
      .overrideTypes<DiferenciaStock[]>(),
  ]);

  const query = comoQuery(params);

  return (
    <FiltrosLocales key={query} inicial={query} servidor={["fecha"]}>
      <TablaTurnos cerrados={turnos} enCurso={enCurso ?? null} diferencias={diferencias ?? []} />
    </FiltrosLocales>
  );
}
