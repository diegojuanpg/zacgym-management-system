"use client";

import { useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useNavegacion } from "@/hooks/use-navegacion";

/**
 * Desplegable atado a un parámetro de la URL, como las solapas y el buscador: el
 * estado se comparte, se puede marcar y el server sigue siendo el que filtra.
 *
 * El valor por defecto no se escribe en la URL, así el link limpio es el estado
 * normal.
 */
export function SelectUrl({
  param,
  valor,
  predeterminado,
  opciones,
  etiqueta,
  prefijo,
}: {
  param: string;
  valor: string;
  predeterminado: string;
  opciones: { valor: string; label: string }[];
  etiqueta: string;
  prefijo?: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const { irA, cargando } = useNavegacion();

  return (
    <Select
      size="small"
      aria-label={etiqueta}
      value={valor}
      disabled={cargando}
      prefix={prefijo}
      onChange={(e) => {
        const nuevos = new URLSearchParams(searchParams.toString());
        if (e.target.value === predeterminado) nuevos.delete(param);
        else nuevos.set(param, e.target.value);
        irA(nuevos);
      }}
    >
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
