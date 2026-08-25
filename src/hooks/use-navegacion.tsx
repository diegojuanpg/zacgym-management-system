"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Cambiar la URL sin que la pantalla se quede muda.
 *
 * Un `router.push` a secas no avisa nada: hasta que el server no contesta, la
 * vista sigue siendo la vieja y parece que el click no entró. Con dos segundos
 * de espera eso se siente como una app colgada, no como una que está pensando.
 *
 * Adentro de una transición, `cargando` dice que hay algo en curso y cada
 * control lo puede mostrar justo donde la persona está mirando.
 */
export function useNavegacion() {
  const router = useRouter();
  const pathname = usePathname();
  const [cargando, arrancar] = React.useTransition();

  const irA = React.useCallback(
    (parametros: URLSearchParams, opciones?: { reemplazar?: boolean }) => {
      const cola = parametros.toString();
      const url = cola === "" ? pathname : `${pathname}?${cola}`;
      arrancar(() => {
        // Sin scroll: filtrar una tabla no es motivo para volver arriba.
        if (opciones?.reemplazar) router.replace(url, { scroll: false });
        else router.push(url, { scroll: false });
      });
    },
    [pathname, router],
  );

  return { irA, cargando };
}
