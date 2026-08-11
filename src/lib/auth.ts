import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "employee";

export interface Staff {
  id: string;
  email: string;
  role: Role;
}

/** Usuario logueado + rol. Redirige a /login si no hay sesion. */
export async function requireStaff(): Promise<Staff> {
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
}
