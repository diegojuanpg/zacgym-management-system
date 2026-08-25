"use client";

import { Toggle } from "@/components/ui/toggle";
import { useNavegacion, useParametros } from "@/hooks/use-navegacion";

/**
 * Interruptor atado a un parámetro de la URL, como las solapas y el buscador: el
 * estado se comparte, sobrevive al refresh y el server sigue siendo el que decide
 * qué se dibuja.
 *
 * El estado por defecto no escribe nada en la URL: el link limpio es el normal.
 * El otro pone `?<param>=si` o `?<param>=no`, según de cuál se salga.
 *
 * Es un interruptor y se ve como uno. Antes iba pintado como una solapa más, y
 * al lado de las de verdad no se distinguía lo que elige filas de lo que
 * enciende columnas.
 */
export function ToggleUrl({
  param,
  etiqueta,
  encendido,
  predeterminado = true,
}: {
  param: string;
  etiqueta: string;
  encendido: boolean;
  /** En qué estado arranca sin parámetro en la URL. */
  predeterminado?: boolean;
}) {
  const searchParams = useParametros();
  const { irA, cargando } = useNavegacion();

  function alternar() {
    const nuevos = new URLSearchParams(searchParams.toString());
    // Volver al estado por defecto limpia el parámetro en vez de escribir el
    // valor: dos URLs distintas para la misma pantalla no ayudan a nadie.
    if (encendido === predeterminado) nuevos.set(param, encendido ? "no" : "si");
    else nuevos.delete(param);
    irA(nuevos);
  }

  return (
    <Toggle checked={encendido} onCheckedChange={alternar} disabled={cargando} className="shrink-0">
      {etiqueta}
    </Toggle>
  );
}
