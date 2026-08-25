"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const Local = React.createContext<{
  parametros: URLSearchParams;
  aplicar: (parametros: URLSearchParams) => void;
  /** Los que sí cambian lo que se consulta: esos siguen yendo al server. */
  servidor: string[];
} | null>(null);

/**
 * Filtros que no van al server.
 *
 * Las tablas ya reciben la lista entera y la recortan con JavaScript: filtrar,
 * buscar u ordenar no necesita otra consulta, solo volver a correr esas mismas
 * funciones. Adentro de este proveedor los controles siguen siendo los de
 * siempre —el buscador, las solapas, los menús de columna— pero en vez de
 * navegar cambian este estado, y la pantalla se rearma en el mismo frame.
 *
 * La URL se actualiza igual, con `replaceState`: sigue sirviendo para compartir
 * o refrescar, pero no dispara el render del server.
 */
export function FiltrosLocales({
  inicial,
  servidor = [],
  children,
}: {
  /** La query con la que llegó la página, para arrancar donde dice la URL. */
  inicial: string;
  /**
   * Parámetros que deciden qué se trae de la base —un período, un día— y no
   * solo qué se muestra. Cambiar uno de esos sí navega.
   *
   * La página tiene que montar esto con `key={inicial}`: así, cuando uno de
   * ellos navega de verdad, el estado local vuelve a arrancar de la URL nueva.
   */
  servidor?: string[];
  children: React.ReactNode;
}) {
  const [parametros, setParametros] = React.useState(() => new URLSearchParams(inicial));

  const aplicar = React.useCallback((nuevos: URLSearchParams) => {
    setParametros(new URLSearchParams(nuevos));
    const cola = nuevos.toString();
    window.history.replaceState(null, "", cola === "" ? window.location.pathname : `?${cola}`);
  }, []);

  // `servidor` llega como lista literal en cada render de la página: se compara
  // por contenido para no rearmar el contexto al pedo.
  const claves = servidor.join(",");
  const valor = React.useMemo(
    () => ({ parametros, aplicar, servidor: claves === "" ? [] : claves.split(",") }),
    [parametros, aplicar, claves],
  );
  return <Local.Provider value={valor}>{children}</Local.Provider>;
}

/**
 * Los parámetros que mandan acá: los locales si la tabla filtra en el navegador,
 * los de la URL si todavía filtra el server.
 */
export function useParametros() {
  const local = React.useContext(Local);
  const deLaUrl = useSearchParams();
  return local?.parametros ?? deLaUrl;
}

/**
 * La vuelta de `comoQuery`: los parámetros como objeto, que es lo que esperan
 * los componentes que arman un link con "los mismos filtros más uno".
 */
export function comoObjeto(parametros: URLSearchParams) {
  const objeto: Record<string, string | string[]> = {};
  for (const clave of new Set(parametros.keys())) {
    const valores = parametros.getAll(clave);
    objeto[clave] = valores.length === 1 ? valores[0] : valores;
  }
  return objeto;
}

/**
 * Cambiar la URL sin que la pantalla se quede muda.
 *
 * Un `router.push` a secas no avisa nada: hasta que el server no contesta, la
 * vista sigue siendo la vieja y parece que el click no entró. Con dos segundos
 * de espera eso se siente como una app colgada, no como una que está pensando.
 *
 * Adentro de una transición, `cargando` dice que hay algo en curso y cada
 * control lo puede mostrar justo donde la persona está mirando. Con filtros
 * locales no hay nada que esperar: `cargando` es siempre false.
 */
export function useNavegacion() {
  const router = useRouter();
  const pathname = usePathname();
  const local = React.useContext(Local);
  const [cargando, arrancar] = React.useTransition();

  const irA = React.useCallback(
    (parametros: URLSearchParams, opciones?: { reemplazar?: boolean }) => {
      const tocaAlServer = local?.servidor.some(
        (clave) => local.parametros.getAll(clave).join("|") !== parametros.getAll(clave).join("|"),
      );
      if (local && !tocaAlServer) {
        local.aplicar(parametros);
        return;
      }
      const cola = parametros.toString();
      const url = cola === "" ? pathname : `${pathname}?${cola}`;
      arrancar(() => {
        // Sin scroll: filtrar una tabla no es motivo para volver arriba.
        if (opciones?.reemplazar) router.replace(url, { scroll: false });
        else router.push(url, { scroll: false });
      });
    },
    [pathname, router, local],
  );

  return { irA, cargando: local ? false : cargando, local: local !== null };
}
