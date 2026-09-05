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
  type ConteoStock,
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
      "id, abierto_en, cerrado_en, caja_grande_inicial, caja_chica_inicial, caja_grande_final, caja_chica_final, caja_grande_esperada, caja_chica_esperada, dif_grande, dif_chica, responsables_detalle, contados, ventas_grande, ventas_chica, movimientos_grande, movimientos_chica, nota_cierre, corregido_en",
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
        "id, abierto_en, caja_grande_inicial, caja_chica_inicial, caja_grande_esperada, caja_chica_esperada, ventas_grande, ventas_chica, movimientos_grande, movimientos_chica, responsables_detalle",
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

  // Todo lo que se contó en esos turnos, no solo lo que no cuadró: el detalle
  // muestra cada producto de la apertura al cierre, incluso el que dio bien.
  // Son ocho filas por turno, asi que entra sin recortar.
  const { data: conteos } = await supabase
    .from("turno_stock")
    .select("turno_id, momento, contado, esperado, producto_id, productos(nombre)")
    .in(
      "turno_id",
      // El abierto tambien: viene por otro lado y sin esto el detalle del turno
      // en curso se quedaba sin stock que mostrar ni que corregir.
      [...turnos.map((t) => t.id), ...(enCurso ? [enCurso.id] : [])],
    )
    .overrideTypes<ConteoStock[]>();

  // Lo vendido de cada producto en cada turno, para que el detalle pueda
  // mostrar 30 - 5 = 25 y no dos numeros sueltos.
  const { data: vendidas } = await supabase
    .from("ventas")
    .select("turno_id, producto_id, cantidad")
    .is("anulada_en", null)
    .in(
      "turno_id",
      [...turnos.map((t) => t.id), ...(enCurso ? [enCurso.id] : [])],
    )
    .overrideTypes<{ turno_id: string; producto_id: string; cantidad: number }[]>();

  // El modal de carga es el del mostrador: necesita los mismos selectores.
  const [alumnos, { data: productos }, deudas] = await Promise.all([
    traerTodo<{ id: string; nombre_completo: string; saldo: number }>(
      supabase.from("alumnos_cuenta").select("id, nombre_completo, saldo").order("nombre_completo"),
    ),
    supabase
      .from("productos")
      .select("id, nombre, precio, stock")
      .eq("activo", true)
      .order("nombre")
      .overrideTypes<{ id: string; nombre: string; precio: number; stock: number | null }[]>(),
    // Las compras impagas: el modal cobra de a una, como en el mostrador.
    traerTodo<{ id: string; alumno_id: string; producto: string; saldo: number }>(
      supabase
        .from("ventas_saldo")
        .select("id, alumno_id, producto, saldo")
        .gt("saldo", 0)
        .is("anulada_en", null)
        .not("turno_id", "is", null)
        .order("creado_en"),
    ),
  ]);

  const query = comoQuery(params);

  return (
    <FiltrosLocales key={query} inicial={query} servidor={["fecha"]}>
      <TablaTurnos
        cerrados={turnos}
        enCurso={enCurso ?? null}
        diferencias={diferencias ?? []}
        conteos={conteos ?? []}
        vendidas={vendidas ?? []}
        alumnos={alumnos}
        productos={productos ?? []}
        deudas={deudas.map((d) => ({
          venta_id: d.id,
          alumno_id: d.alumno_id,
          producto: d.producto,
          debe: d.saldo,
        }))}
      />
    </FiltrosLocales>
  );
}
