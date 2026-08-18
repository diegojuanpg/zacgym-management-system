import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { COOKIE_MENU } from "@/lib/menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const staff = await requireStaff();
  // Por defecto fijo: solo se pliega si el usuario lo pidió.
  const fijo = (await cookies()).get(COOKIE_MENU)?.value !== "no";

  async function cerrarSesion() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-1">
      <AppSidebar
        fijoInicial={fijo}
        pie={
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="truncate text-copy-13 text-muted-foreground">{staff.email}</span>
              <Badge variant={staff.role === "admin" ? "gray-subtle" : "blue-subtle"}>
                {staff.role}
              </Badge>
            </div>
            <form action={cerrarSesion}>
              <Button type="submit" variant="secondary" size="sm" className="w-full">
                Salir
              </Button>
            </form>
          </div>
        }
      />
      {/* min-w-0: sin esto una tabla ancha estira el layout y empuja el menú.
          pt-14 deja lugar a la barra fija del celular. El ancho de página lo
          define el shell y no cada sección: antes cada una elegía el suyo y
          cambiar de solapa movía todo de lugar. */}
      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
