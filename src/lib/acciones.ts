"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth";

export interface Resultado {
  error?: string;
  ok?: string;
}

const texto = (form: FormData, campo: string) => String(form.get(campo) ?? "").trim();
const entero = (form: FormData, campo: string) => Number(form.get(campo) ?? 0);

// Postgres ya valida todo (RLS, checks, saldo): traducimos su mensaje y listo.
async function rpc(fn: string, args: Record<string, unknown>, ok: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/configuracion");
  return { ok };
}

// ============================== mostrador ==============================

export async function registrarVenta(_prev: Resultado, form: FormData): Promise<Resultado> {
  const metodo = texto(form, "metodo");
  return rpc(
    "registrar_venta",
    {
      p_alumno_id: texto(form, "alumno_id"),
      p_producto_id: texto(form, "producto_id"),
      p_cantidad: entero(form, "cantidad") || 1,
      p_metodo: metodo === "fiado" ? null : metodo,
      p_nota: texto(form, "nota") || null,
    },
    metodo === "fiado" ? "Venta cargada como deuda." : "Venta cobrada.",
  );
}

export async function registrarPago(_prev: Resultado, form: FormData): Promise<Resultado> {
  return rpc(
    "registrar_pago",
    {
      p_venta_id: texto(form, "venta_id"),
      p_monto: entero(form, "monto"),
      p_metodo: texto(form, "metodo"),
    },
    "Pago registrado.",
  );
}

export async function anularVenta(_prev: Resultado, form: FormData): Promise<Resultado> {
  return rpc("anular_venta", { p_venta_id: texto(form, "venta_id") }, "Venta anulada.");
}

// ============================== configuracion ==============================

export async function crearProducto(_prev: Resultado, form: FormData): Promise<Resultado> {
  const supabase = await createClient();
  const tipo = texto(form, "tipo");
  const { error } = await supabase.from("productos").insert({
    nombre: texto(form, "nombre"),
    tipo,
    precio: entero(form, "precio"),
    meses_equivale: tipo === "mensualidad" ? entero(form, "meses_equivale") || 1 : null,
    stock: tipo === "mensualidad" ? 0 : entero(form, "stock"),
  });
  if (error) {
    return {
      error: error.code === "23505" ? "Ya existe un item con ese nombre." : error.message,
    };
  }
  revalidatePath("/configuracion");
  revalidatePath("/");
  return { ok: "Item agregado." };
}

/** Borra de verdad si nunca se vendio; si tiene ventas lo desactiva para no romper el historial. */
export async function borrarProducto(_prev: Resultado, form: FormData): Promise<Resultado> {
  const supabase = await createClient();
  const id = texto(form, "id");

  const { error } = await supabase.from("productos").delete().eq("id", id);
  if (error?.code === "23503") {
    const { error: errorDesactivar } = await supabase
      .from("productos")
      .update({ activo: false })
      .eq("id", id);
    if (errorDesactivar) return { error: errorDesactivar.message };
    revalidatePath("/configuracion");
    revalidatePath("/");
    return { ok: "Tiene ventas cargadas, así que quedó desactivado en vez de borrado." };
  }
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  revalidatePath("/");
  return { ok: "Item borrado." };
}

export async function crearAlumno(_prev: Resultado, form: FormData): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("alumnos").insert({
    apellido: texto(form, "apellido"),
    nombre: texto(form, "nombre"),
  });
  if (error) {
    return { error: error.code === "23505" ? "Ese alumno ya está en el listado." : error.message };
  }
  revalidatePath("/configuracion");
  revalidatePath("/");
  return { ok: "Alumno agregado." };
}

export async function borrarAlumno(_prev: Resultado, form: FormData): Promise<Resultado> {
  const supabase = await createClient();
  const id = texto(form, "id");

  const { error } = await supabase.from("alumnos").delete().eq("id", id);
  if (error?.code === "23503") {
    const { error: errorDesactivar } = await supabase
      .from("alumnos")
      .update({ activo: false })
      .eq("id", id);
    if (errorDesactivar) return { error: errorDesactivar.message };
    revalidatePath("/configuracion");
    revalidatePath("/");
    return { ok: "Tiene ventas cargadas, así que quedó inactivo en vez de borrado." };
  }
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  revalidatePath("/");
  return { ok: "Alumno borrado." };
}

// ============================== usuarios del sistema ==============================

export async function crearUsuario(_prev: Resultado, form: FormData): Promise<Resultado> {
  const staff = await requireStaff();
  if (staff.role !== "admin") return { error: "Solo un admin puede crear cuentas." };

  const email = texto(form, "email").toLowerCase();
  const password = texto(form, "password");
  const rol = texto(form, "rol");

  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };
  if (rol !== "admin" && rol !== "employee") return { error: "Rol inválido." };

  // create_staff() es security definer y toca auth.users: va con service_role, no con el
  // token del usuario.
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { error } = await admin.rpc("create_staff", {
    p_email: email,
    p_password: password,
    p_role: rol,
  });
  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Ya existe una cuenta con ese email."
        : error.message,
    };
  }
  revalidatePath("/configuracion");
  return { ok: `Cuenta ${email} creada como ${rol}.` };
}
