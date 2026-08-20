import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "employee";

export interface Staff {
  id: string;
  email: string;
  role: Role;
}

/**
 * Usuario logueado + rol. Redirige a /login si no hay sesion.
 *
 * Con cache() porque el layout y la pagina la llaman las dos, y cada llamada
 * era un viaje entero a Supabase Auth: getUser() valida el token contra el
 * server, no lo lee de la cookie. Ahora sale una sola vez por request y la
 * segunda llamada se la lleva de memoria.
 */
export const requireStaff = cache(async function requireStaff(): Promise<Staff> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return {
    id: user.id,
    email: user.email ?? "",
    // Cuentas creadas con create_staff() siempre traen role; el fallback cubre
    // una cuenta cargada a mano sin el campo.
    role: user.app_metadata?.role === "admin" ? "admin" : "employee",
  };
});
