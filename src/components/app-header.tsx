import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Staff } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AppHeader({ staff }: { staff: Staff }) {
  async function cerrarSesion() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
      <nav className="flex items-center gap-4">
        <Link href="/" className="text-heading-16">
          ZacGym
        </Link>
        <Link href="/" className="text-label-14 text-muted-foreground hover:text-foreground">
          Mostrador
        </Link>
        {staff.role === "admin" && (
          <Link
            href="/configuracion"
            className="text-label-14 text-muted-foreground hover:text-foreground"
          >
            Configuración
          </Link>
        )}
      </nav>
      <div className="flex items-center gap-3">
        <span className="hidden text-copy-13 text-muted-foreground sm:inline">{staff.email}</span>
        <Badge variant={staff.role === "admin" ? "gray-subtle" : "blue-subtle"}>
          {staff.role}
        </Badge>
        <form action={cerrarSesion}>
          <Button type="submit" variant="secondary" size="sm">
            Salir
          </Button>
        </form>
      </div>
    </header>
  );
}
