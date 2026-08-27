import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { COOKIE_MENU } from "@/lib/menu";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";

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
      {/* Los avisos de "listo, y si te arrepentís, deshacer" viven acá: una sola
          vez para toda la app. */}
      <Toaster />
      <AppSidebar
        fijoInicial={fijo}
        pie={
          <div className="flex flex-col gap-2">
            {/* Solo el mail: el rol no cambia nada de lo que se ve, asi que
                era una pastilla que ocupaba lugar y no informaba. */}
            <span className="truncate text-copy-13 text-muted-foreground">{staff.email}</span>
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
          cambiar de solapa movía todo de lugar.

          100rem y no 80: las tablas anchas —Alumnos con el contacto a la vista
          son once columnas— se salían del borde y había que scrollear al
          costado para leer un mail. En una pantalla de 1920 el tope viejo
          dejaba 300px de margen muerto de cada lado. */}
      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        <div className="mx-auto flex w-full max-w-[100rem] flex-1 flex-col px-4 py-6 sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
}
