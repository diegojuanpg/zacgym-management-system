"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ItemVenta {
  alumno_id: string;
  producto_id: string;
  cantidad: number;
  /** Lo que entregó en cada forma. Los tres en 0 = queda debiendo el total. */
  efectivo: number;
  transferencia: number;
  /** Sin cargo: lo que se lleva el dueño. Salda la venta sin que entre plata. */
  no_paga: number;
}

export interface ItemMovimiento {
  tipo: "ingreso" | "egreso";
  monto: number;
  motivo: string;
  caja: "grande" | "chica";
  metodo: "efectivo" | "transferencia";
  /** Devolución: además de sacar la plata del cajón, le baja el saldo a favor. */
  alumno_id?: string;
}

export interface ItemCobro {
  alumno_id: string;
  /** La compra que está pagando. Sin esto se imputa FIFO a las más viejas. */
  venta_id?: string;
  /** Lo que entrega contra esa compra. */
  efectivo: number;
  transferencia: number;
}

/**
 * Ventas, movimientos y cobros del mismo lote, en una sola transacción.
 *
 * `en` apunta la carga a un turno viejo con la hora que corresponda, para
 * arreglar lo que nadie anotó en su momento. Sin eso va al turno abierto y con
 * la hora de ahora, que es el camino de todos los días.
 */
export async function registrarLote(
  ventas: ItemVenta[],
  movimientos: ItemMovimiento[],
  cobros: ItemCobro[] = [],
  en?: { turnoId: string; creadoEn: string },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_lote", {
    p_ventas: ventas,
    p_movimientos: movimientos,
    p_cobros: cobros,
    p_turno_id: en?.turnoId ?? null,
    p_creado_en: en?.creadoEn ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/mostrador");
  revalidatePath("/turnos");
  revalidatePath("/ventas");
  revalidatePath("/alumnos");
  return {};
}

// Borrado real, sin papelera: la fila se va de la base y no queda registro de
// quién la borró. Los dos listados (mostrador y ventas) llaman acá, así que
// se comportan igual; refrescamos los dos.
const refrescar = () => {
  revalidatePath("/mostrador");
  revalidatePath("/ventas");
  revalidatePath("/alumnos");
};

/** Borra la venta con sus pagos y devuelve el stock. */
export async function borrarVenta(ventaId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("borrar_venta", { p_venta_id: ventaId });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

export async function borrarMovimiento(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("borrar_movimiento", { p_movimiento_id: id });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

/** Un cobro se borra pago por pago: uno solo pudo saldar varias compras. */
export async function borrarPago(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_pago", { p_pago_id: id });
  if (error) return { error: error.message };
  refrescar();
  return {};
}

export async function editarMovimiento(
  id: string,
  datos: {
    metodo?: "efectivo" | "transferencia";
    monto?: number;
  },
): Promise<{ error?: string }> {
  if (datos.monto !== undefined && (isNaN(datos.monto) || datos.monto <= 0)) {
    return { error: "El monto debe ser mayor a 0." };
  }

  const supabase = await createClient();
  const actualizacion: { metodo?: "efectivo" | "transferencia"; monto?: number } = {};
  if (datos.metodo !== undefined) actualizacion.metodo = datos.metodo;
  if (datos.monto !== undefined) actualizacion.monto = Math.round(datos.monto);

  const { data, error } = await supabase
    .from("movimientos_caja")
    .update(actualizacion)
    .eq("id", id)
    .select("id");

  if (error) return { error: error.message };
  if ((data ?? []).length === 0) return { error: "No se pudo editar el movimiento." };

  refrescar();
  return {};
}

export async function editarVenta(
  id: string,
  datos: {
    metodo?: "efectivo" | "transferencia";
    monto?: number;
  },
): Promise<{ error?: string }> {
  if (datos.monto !== undefined && (isNaN(datos.monto) || datos.monto < 0)) {
    return { error: "El monto debe ser mayor o igual a 0." };
  }

  const supabase = await createClient();

  if (datos.metodo !== undefined) {
    const { error: errorPago } = await supabase
      .from("pagos")
      .update({ metodo: datos.metodo })
      .eq("venta_id", id);
    if (errorPago) return { error: errorPago.message };
  }

  if (datos.monto !== undefined) {
    const entero = Math.round(datos.monto);
    const [{ error: errorVenta }, { error: errorPago }] = await Promise.all([
      supabase.from("ventas").update({ total: entero, precio_unitario: entero }).eq("id", id),
      supabase.from("pagos").update({ monto: entero }).eq("venta_id", id),
    ]);
    if (errorVenta) return { error: errorVenta.message };
    if (errorPago) return { error: errorPago.message };
  }

  refrescar();
  return {};
}

export async function editarCobro(
  pagoIds: string[],
  datos: {
    metodo?: "efectivo" | "transferencia";
    monto?: number;
  },
): Promise<{ error?: string }> {
  if (datos.monto !== undefined && (isNaN(datos.monto) || datos.monto < 0)) {
    return { error: "El monto debe ser mayor o igual a 0." };
  }

  const supabase = await createClient();

  if (datos.metodo !== undefined) {
    const { error } = await supabase
      .from("pagos")
      .update({ metodo: datos.metodo })
      .in("id", pagoIds);
    if (error) return { error: error.message };
  }

  if (datos.monto !== undefined) {
    const entero = Math.round(datos.monto);
    if (pagoIds.length === 1) {
      const { error } = await supabase
        .from("pagos")
        .update({ monto: entero })
        .eq("id", pagoIds[0]);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from("pagos")
        .update({ monto: entero })
        .eq("id", pagoIds[0]);
      if (error) return { error: error.message };
    }
  }

  refrescar();
  return {};
}

/**
 * Marca (o desmarca) que una mensualidad quedó cargada en la planilla o en la
 * app de pagos.
 *
 * Son dos acuses sueltos y no un estado único: "cargada" es tener los dos, y
 * mientras falte uno la venta sigue en la cola. Guarda el momento en vez de un
 * booleano, así también queda cuándo se hizo.
 */
export async function marcarCargada(
  ventaId: string,
  donde: "sheet" | "app",
  cargada: boolean,
): Promise<{ error?: string }> {
  const columna = donde === "sheet" ? "cargada_sheet_en" : "cargada_app_en";

  const supabase = await createClient();
  // select() para saber si tocó algo: con RLS, un update que no alcanza ninguna
  // fila vuelve sin error y sin haber hecho nada.
  const { data, error } = await supabase
    .from("ventas")
    .update({ [columna]: cargada ? new Date().toISOString() : null })
    .eq("id", ventaId)
    .select("id");

  if (error) return { error: error.message };
  if ((data ?? []).length === 0) return { error: "No se pudo marcar la mensualidad." };

  revalidatePath("/ventas");
  return {};
}
