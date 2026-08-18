"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ChevronDoubleLeftIcon,
  AlertIcon,
  ChevronDoubleRightIcon,
  DollarIcon,
  MenuIcon,
  MoonIcon,
  StoreIcon,
  SunIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { COOKIE_MENU } from "@/lib/menu";
import { cn } from "@/lib/utils";

const SECCIONES = [
  // Productos no tiene item propio: es parte del mostrador y lo deja marcado.
  { href: "/mostrador", nombre: "Mostrador", icono: StoreIcon, incluye: ["/productos"] },
  { href: "/ventas", nombre: "Ventas", icono: DollarIcon, incluye: [] },
  { href: "/incoherencias", nombre: "Incoherencias", icono: AlertIcon, incluye: [] },
  { href: "/alumnos", nombre: "Alumnos", icono: UsersIcon, incluye: [] },
];

/**
 * Menú lateral, con dos comportamientos según el ancho.
 *
 * En escritorio queda fijo o plegado a una tira de iconos que se abre al pasar el
 * mouse; plegado, el panel abierto va por encima del contenido, porque si empujara
 * la página entrar y salir con el mouse la haría saltar todo el tiempo.
 *
 * En el celular no hay mouse que acercar y 224px de menú sobre 390px de pantalla
 * no dejan lugar a la tabla: ahí el menú es un cajón que se abre desde la barra
 * de arriba y se cierra al elegir.
 *
 * El pie (cuenta y salir) lo pone el layout, que es server.
 */
export function AppSidebar({
  pie,
  fijoInicial,
}: {
  pie: React.ReactNode;
  fijoInicial: boolean;
}) {
  const pathname = usePathname();
  const { setTheme, resolvedTheme } = useTheme();
  const [fijo, setFijo] = React.useState(fijoInicial);
  const [encima, setEncima] = React.useState(false);
  const [cajon, setCajon] = React.useState(false);

  React.useEffect(() => {
    if (!cajon) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setCajon(false);
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [cajon]);

  function alternar() {
    setFijo((previo) => {
      const ahora = !previo;
      document.cookie = `${COOKIE_MENU}=${ahora ? "si" : "no"}; path=/; max-age=31536000; samesite=lax`;
      return ahora;
    });
  }

  const abierto = fijo || encima;

  return (
    <>
      {/* Barra del celular: sostiene el disparador del cajón y el nombre. */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-[var(--ds-background-100)] px-3 md:hidden">
        <Button
          variant="tertiary"
          size="icon-lg"
          onClick={() => setCajon(true)}
          aria-label="Abrir menú"
          aria-expanded={cajon}
        >
          <MenuIcon className="size-4" />
        </Button>
        <span className="text-heading-16">ZacGym</span>
      </header>

      {/* Espaciador: el panel es fixed, esto es lo que le corre el contenido. */}
      <div
        className={cn(
          "hidden shrink-0 transition-[width] duration-150 md:block",
          fijo ? "w-56" : "w-14",
        )}
        aria-hidden
      />

      {cajon && (
        <div
          className="animate-in fade-in-0 fixed inset-0 z-40 bg-black/60 duration-150 md:hidden"
          onClick={() => setCajon(false)}
          aria-hidden
        />
      )}

      <aside
        onMouseEnter={() => setEncima(true)}
        onMouseLeave={() => setEncima(false)}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-border bg-[var(--ds-background-100)]",
          "transition-[width,transform] duration-200 ease-out",
          // Celular: cajón de ancho fijo que entra desde el borde.
          "w-64",
          cajon ? "translate-x-0" : "-translate-x-full",
          // Escritorio: siempre a la vista, ancho según esté fijo o plegado.
          "md:translate-x-0",
          abierto ? "md:w-56" : "md:w-14",
          !fijo && encima && "md:shadow-[var(--ds-shadow-menu)]",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <Link href="/mostrador" className="text-heading-16 truncate">
            <span className="md:hidden">ZacGym</span>
            <span className="hidden md:inline">{abierto ? "ZacGym" : "Z"}</span>
          </Link>

          <Button
            variant="tertiary"
            size="icon-sm"
            onClick={() => setCajon(false)}
            aria-label="Cerrar menú"
            className="ml-auto shrink-0 text-[var(--ds-gray-900)] md:hidden"
          >
            <XIcon className="size-4" />
          </Button>

          {abierto && (
            <Button
              variant="tertiary"
              size="icon-sm"
              onClick={alternar}
              title={fijo ? "Plegar menú" : "Dejar el menú fijo"}
              aria-label={fijo ? "Plegar menú" : "Dejar el menú fijo"}
              aria-pressed={fijo}
              className="ml-auto hidden shrink-0 text-[var(--ds-gray-900)] md:inline-flex"
            >
              {fijo ? (
                <ChevronDoubleLeftIcon className="size-4" />
              ) : (
                <ChevronDoubleRightIcon className="size-4" />
              )}
            </Button>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {SECCIONES.map(({ href, nombre, icono: Icono, incluye }) => {
            // startsWith para que las subpáginas dejen la sección marcada.
            const activa = [href, ...incluye].some(
              (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
            );
            return (
              <Link
                key={href}
                href={href}
                // En el celular el cajón tapa la pantalla: elegir sección lo cierra.
                onClick={() => setCajon(false)}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  // h-11 en el celular: 44px es el mínimo que se toca sin errarle.
                  "flex h-11 items-center gap-2.5 rounded-md px-2.5 text-label-14 whitespace-nowrap transition-colors md:h-9",
                  activa
                    ? "bg-[var(--ds-gray-alpha-200)] text-foreground"
                    : "text-muted-foreground hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground",
                )}
              >
                <Icono className="size-4 shrink-0" />
                {/* Plegado no hace falta tooltip: acercar el mouse ya abre el menú. */}
                <span className={cn("md:hidden")}>{nombre}</span>
                <span className="hidden md:inline">{abierto ? nombre : null}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2 border-t border-border p-3">
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Cambiar entre tema claro y oscuro"
            prefix={
              // Los dos van al DOM y los alterna el tema: leer resolvedTheme al
              // dibujar haría que el server y el cliente no coincidan.
              <>
                <SunIcon className="hidden size-4 dark:block" />
                <MoonIcon className="size-4 dark:hidden" />
              </>
            }
            className={cn("w-full justify-start text-[var(--ds-gray-900)]", !abierto && "md:justify-center")}
          >
            <span className="md:hidden">Cambiar tema</span>
            {abierto && <span className="hidden md:inline">Cambiar tema</span>}
          </Button>

          <div className="md:hidden">{pie}</div>
          <div className="hidden md:block">{abierto ? pie : null}</div>
        </div>
      </aside>
    </>
  );
}
