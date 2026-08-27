import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rangoDe } from "@/lib/filtros";
import { traerTodo } from "@/lib/traer-todo";
import { comoQuery } from "@/lib/query";
import { FiltrosLocales } from "@/hooks/use-navegacion";
import { PERIODOS } from "@/lib/periodos";
import type { DiaDeIngresos } from "@/lib/ingresos";
import {
  TablaVentas,
  type VentaFila,
  type PagoFila,
  type MovimientoFila,
  type CobroFila,
  type Registro,
} from "./tabla";

/** Corte del período. Fuera del render: Date.now() no es puro. */
function corteDe(dias: number | null) {
  return dias === null ? null : new Date(Date.now() - dias * 86400000).toISOString();
}

/**
 * La página resuelve el período —que es lo único que cambia qué se trae de la
 * base— y arma la lista. El resto de los filtros pasa en el navegador: son los
 * mismos registros mirados de otra manera, no otra consulta.
 */
export default async function VentasPage({ searchParams }: PageProps<"/ventas">) {
  await requireStaff();
  const parametros = await searchParams;
  const { periodo, fecha } = parametros;

  const elegido = PERIODOS.find((p) => p.valor === periodo) ?? PERIODOS[0];
  // Un rango de fechas explícito manda sobre el período: si el usuario eligió
  // "del 1 al 15", el "últimos 30 días" de al lado no tiene nada que decir.
  // Argentina no cambia de hora: el -03:00 fijo alcanza para pasar a UTC.
  const rangoFecha = rangoDe(fecha);
  const hayRango = rangoFecha.desde !== "" || rangoFecha.hasta !== "";
  const desde = hayRango
    ? rangoFecha.desde
      ? `${rangoFecha.desde}T00:00:00-03:00`
      : null
    : corteDe(elegido.dias);
  const hasta = rangoFecha.hasta ? `${rangoFecha.hasta}T23:59:59.999-03:00` : null;

  const supabase = await createClient();

  let qVentas = supabase
    .from("ventas_saldo")
    .select(
      "id, alumno, alumno_id, producto, producto_id, categoria, cantidad, total, efectivo, transferencia, no_paga, a_favor, saldo, turno_id, creado_en, anulada_en, cargada_sheet_en, cargada_app_en",
    );
  let qPagos = supabase
    .from("pagos_detalle")
    .select("id, venta_id, alumno, alumno_id, monto, metodo, turno_id, creado_en, anulada_en");
  let qMovs = supabase
    .from("movimientos_caja_detalle")
    .select("id, tipo, caja, metodo, monto, motivo, turno_id, creado_en, anulado_en");

  if (desde) {
    qVentas = qVentas.gte("creado_en", desde);
    qPagos = qPagos.gte("creado_en", desde);
    qMovs = qMovs.gte("creado_en", desde);
  }
  if (hasta) {
    qVentas = qVentas.lte("creado_en", hasta);
    qPagos = qPagos.lte("creado_en", hasta);
    qMovs = qMovs.lte("creado_en", hasta);
  }

  const [ventas, pagos, movimientos, { data: ingresos }] = await Promise.all([
    traerTodo<VentaFila>(qVentas.order("creado_en", { ascending: false })),
    traerTodo<PagoFila>(qPagos.order("creado_en", { ascending: false })),
    traerTodo<MovimientoFila>(qMovs.order("creado_en", { ascending: false })),
    // El grafico tiene su propio periodo, asi que se trae el historico entero y
    // no lo que pidio el encabezado de Fecha. Es una fila por dia y rubro: unos
    // cientos al año, ya sumadas en la base.
    supabase.from("ventas_por_dia").select("dia, rubro, monto").order("dia"),
  ]);

  // El pago hecho el mismo día que su venta ya está contado en la fila de esa
  // venta. Solo los que saldan una compra de otro día son un cobro aparte, y
  // se agrupan por alumno y momento porque un cobro puede tocar varias compras.
  // Se resuelve acá y no en el navegador: son miles de pagos que, agrupados,
  // quedan en un puñado de filas.
  const diaDeVenta = new Map(ventas.map((v) => [v.id, v.creado_en.slice(0, 10)]));
  const cobros = new Map<string, CobroFila>();
  for (const p of pagos.filter((p) => !p.anulada_en)) {
    if (diaDeVenta.get(p.venta_id) === p.creado_en.slice(0, 10)) continue;
    // Sin cargo no es plata que entró, y una imputación de saldo a favor
    // tampoco: son las dos caras de una plata que ya se cobró antes.
    if (p.metodo === "no_paga" || p.metodo === "a_favor") continue;

    const clave = `${p.alumno}|${p.creado_en}`;
    const fila = cobros.get(clave) ?? {
      ids: [],
      alumno: p.alumno,
      alumno_id: p.alumno_id,
      turno_id: p.turno_id,
      efectivo: 0,
      transferencia: 0,
      creado_en: p.creado_en,
    };
    fila.ids.push(p.id);
    fila[p.metodo] += p.monto;
    cobros.set(clave, fila);
  }

  const todos: Registro[] = [
    ...ventas.map((v) => ({ clase: "venta" as const, ...v })),
    ...[...cobros.values()].map((c) => ({ clase: "cobro" as const, ...c })),
    ...movimientos.map((m) => ({ clase: "movimiento" as const, ...m })),
  ];

  const query = comoQuery(parametros);

  return (
    <FiltrosLocales key={query} inicial={query} servidor={["periodo", "fecha"]}>
      <TablaVentas
        registros={todos}
        etiquetaPeriodo={elegido.label}
        ingresos={(ingresos ?? []) as DiaDeIngresos[]}
      />
    </FiltrosLocales>
  );
}
