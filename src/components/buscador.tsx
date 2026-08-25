"use client";

import * as React from "react";
import { SearchInput } from "@/components/ui/search-input";
import { useNavegacion, useParametros } from "@/hooks/use-navegacion";

/**
 * Busca mientras escribís. Va a la URL igual que el resto de los filtros.
 *
 * Con los filtros en el server hay un respiro de 250 ms, porque cada tecla es
 * una consulta. Adentro de `FiltrosLocales` no hay nada que esperar: filtra en
 * el mismo frame en que soltás la tecla.
 */
export function Buscador({
  inicial,
  placeholder,
  param = "q",
}: {
  inicial: string;
  placeholder: string;
  param?: string;
}) {
  const searchParams = useParametros();
  const { irA, cargando, local } = useNavegacion();
  const [texto, setTexto] = React.useState(inicial);

  React.useEffect(() => {
    const actual = searchParams.get(param) ?? "";
    if (texto === actual) return;

    const id = setTimeout(() => {
      const nuevos = new URLSearchParams(searchParams.toString());
      if (texto.trim() === "") nuevos.delete(param);
      else nuevos.set(param, texto.trim());
      irA(nuevos, { reemplazar: true });
      // Sin espera cuando filtra el navegador: no hay consulta que ahorrar.
    }, local ? 0 : 250);
    return () => clearTimeout(id);
  }, [texto, param, searchParams, irA, local]);

  return (
    <div className="w-72">
      {/* Sin size: el `medium` del sistema es h-9 y text-sm, los mismos 14px que
          la tabla. `large` lo subía a 16px y el buscador pesaba más que los datos. */}
      <SearchInput
        placeholder={placeholder}
        aria-label={placeholder}
        value={texto}
        onValueChange={setTexto}
        // La lupa se convierte en spinner mientras el server busca.
        loading={cargando}
      />
    </div>
  );
}
