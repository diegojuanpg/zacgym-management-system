import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { traerTodo } from "@/lib/traer-todo";
import { DESDE_CARGA, MENSUALIDADES, pendienteDeCarga, type CargaDeVenta } from "@/lib/mensualidades";
import { AppSidebar } from "@/components/app-sidebar";
import { COOKIE_MENU } from "@/lib/menu";
import { cuantosMal, type Corrida } from "@/lib/pipelines";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const staff = await requireStaff();
  // Por defecto fijo: solo se pliega si el usuario lo pidió.
  const fijo = (await cookies()).get(COOKIE_MENU)?.value !== "no";

  // Lo que falta hacer, para los circulitos del menú. El reparto se hace acá:
  // de tareas son dos números sobre las que no están terminadas —las terminadas,
  // que son las que crecen sin techo, ni se traen—, y de ventas las mensualidades
  // que todavía no se replicaron afuera.
  //
  // El or() de las mensualidades trae de más a propósito: es el conjunto que
  // `pendienteDeCarga` puede llegar a contar —falta un acuse, o está anulada
  // después de haberse cargado—, así no se traen las miles ya resueltas.
  const supabase = await createClient();
  const [{ data: abiertas }, mensualidades, { count: revisar }, { data: ultimas }] =
    await Promise.all([
      supabase.from("tareas").select("estado").neq("estado", "terminada"),
      traerTodo<CargaDeVenta>(
        supabase
          .from("ventas_saldo")
          .select("categoria, creado_en, anulada_en, cargada_sheet_en, cargada_app_en")
          .eq("categoria", MENSUALIDADES)
          .gte("creado_en", new Date(DESDE_CARGA).toISOString())
          .or("cargada_sheet_en.is.null,cargada_app_en.is.null,anulada_en.not.is.null"),
      ),
      // La vista ya decide quiénes son; acá solo hace falta cuántos.
      supabase.from("alumnos_revisar_rutina").select("id", { count: "exact", head: true }),
      // Siete filas: una por pipeline. El circulito avisa del que dejó de correr,
      // que es lo único que no manda mail solo.
      supabase.from("pipeline_ultima").select("*"),
    ]);

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
        pendientes={abiertas?.filter((t) => t.estado === "pendiente").length ?? 0}
        enProceso={abiertas?.filter((t) => t.estado === "en_proceso").length ?? 0}
        sinCargar={mensualidades.filter(pendienteDeCarga).length}
        revisar={revisar ?? 0}
        pipelinesMal={cuantosMal((ultimas ?? []) as Corrida[])}
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
