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
 * `getClaims()` y no `getUser()`: el proyecto firma los tokens con clave
 * asimetrica (ES256), asi que la firma se verifica en el mismo proceso contra
 * la clave publica —que queda cacheada en memoria— y no hay viaje a Supabase
 * Auth. `getUser()` era una vuelta a la red antes de la primera consulta, en
 * cada navegacion. Si el token vencio, `getClaims()` lo renueva igual: por
 * dentro pasa por `getSession()`.
 *
 * Sigue con cache() porque el layout y la pagina la llaman las dos.
 */
export const requireStaff = cache(async function requireStaff(): Promise<Staff> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) redirect("/login");

  const rol = (claims.app_metadata as { role?: string } | undefined)?.role;

  return {
    id: claims.sub,
    email: claims.email ?? "",
    // Cuentas creadas con create_staff() siempre traen role; el fallback cubre
    // una cuenta cargada a mano sin el campo.
    role: rol === "admin" ? "admin" : "employee",
  };
});
