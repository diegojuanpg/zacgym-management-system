"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/ui/search-input";

/**
 * Busca mientras escribís. Va a la URL igual que el resto de los filtros, pero
 * con un respiro: sin la espera, cada tecla dispara una consulta al server.
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [texto, setTexto] = React.useState(inicial);

  React.useEffect(() => {
    const actual = searchParams.get(param) ?? "";
    if (texto === actual) return;

    const id = setTimeout(() => {
      const nuevos = new URLSearchParams(searchParams.toString());
      if (texto.trim() === "") nuevos.delete(param);
      else nuevos.set(param, texto.trim());
      router.replace(`${pathname}?${nuevos.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(id);
  }, [texto, param, searchParams, pathname, router]);

  return (
    <div className="w-72">
      {/* Sin size: el `medium` del sistema es h-9 y text-sm, los mismos 14px que
          la tabla. `large` lo subía a 16px y el buscador pesaba más que los datos. */}
      <SearchInput
        placeholder={placeholder}
        aria-label={placeholder}
        value={texto}
        onValueChange={setTexto}
      />
    </div>
  );
}
