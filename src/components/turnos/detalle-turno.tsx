"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CajaCard, type EstadoCaja } from "@/components/mostrador/caja-card";

/** Lo que hay que contar de un cajón en un turno. */
export interface DesgloseCaja {
  inicial: number;
  ventas: number;
  movimientos: number;
  esperado: number;
  /** Lo que contaron al cerrar. null si el turno sigue abierto o nadie contó. */
  contado: number | null;
}

export interface DiferenciaDeStock {
  producto: string;
  momento: string;
  contado: number;
  esperado: number;
  diferencia: number;
  valor: number;
}

const pesos = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;

/**
 * El detalle de un turno: de dónde sale lo que tenía que haber en cada cajón.
 *
 * La fila de la tabla dice "$187.500 → $312.500", que es el qué. Acá está el
 * porqué: con cuánto se abrió, cuánto entró por ventas y cobros, cuánto se sacó
 * o se repuso a mano, y contra eso lo que contaron al cerrar. Sin ese desglose
 * un faltante no se puede rastrear sin ponerse a sumar la tabla del mostrador.
 *
 * Las tarjetas son las mismas del mostrador: la cuenta es idéntica, lo único
 * que cambia es que acá el recorte es un turno y allá el día entero.
 */
export function DetalleTurno({
  cuando,
  abierto,
  grande,
  chica,
  stock,
  nota,
  responsables,
}: {
  /** El encabezado del modal: "25/8, 14:18 → 19:19". */
  cuando: string;
  abierto: boolean;
  grande: DesgloseCaja;
  chica: DesgloseCaja;
  stock: DiferenciaDeStock[];
  nota: string | null;
  responsables: React.ReactNode;
}) {
  const [verlo, setVerlo] = React.useState(false);

  const comoCaja = (d: DesgloseCaja): EstadoCaja =>
    abierto
      ? { estado: "abierto", inicial: d.inicial, ventas: d.ventas, movimientos: d.movimientos, esperado: d.esperado }
      : {
          estado: "cerrado",
          inicial: d.inicial,
          ventas: d.ventas,
          movimientos: d.movimientos,
          esperado: d.esperado,
          contado: d.contado,
        };

  return (
    <>
      <Button variant="tertiary" size="sm" onClick={() => setVerlo(true)}>
        Ver
      </Button>

      <Modal
        open={verlo}
        onOpenChange={setVerlo}
        title={`Turno del ${cuando}`}
        description={abierto ? "En curso: lo que tendría que haber ahora." : undefined}
        className="w-[min(46rem,94vw)]"
        footer={
          <Button variant="secondary" onClick={() => setVerlo(false)}>
            Cerrar
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <CajaCard etiqueta="Caja grande" caja={comoCaja(grande)} />
            <CajaCard etiqueta="Caja chica" caja={comoCaja(chica)} />
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-label-14 text-muted-foreground">A cargo</h3>
            {responsables}
          </section>

          {stock.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-label-14 text-muted-foreground">Stock</h3>
              <ul className="flex flex-col gap-1.5">
                {stock.map((d) => (
                  <li
                    key={`${d.producto}-${d.momento}`}
                    className="flex flex-wrap items-center gap-2 text-copy-14"
                  >
                    <Badge variant={d.diferencia < 0 ? "red-subtle" : "amber-subtle"}>
                      {d.diferencia > 0 ? "+" : ""}
                      {d.diferencia} {d.producto}
                    </Badge>
                    <span className="text-muted-foreground">
                      contaron {d.contado} y tenían que ser {d.esperado}
                      {d.momento === "apertura" && " (al abrir)"}
                      {d.valor !== 0 && ` · ${pesos(d.valor)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {nota && (
            <section className="flex flex-col gap-2">
              <h3 className="text-label-14 text-muted-foreground">Nota del cierre</h3>
              <p className="text-copy-14 whitespace-pre-wrap">{nota}</p>
            </section>
          )}
        </div>
      </Modal>
    </>
  );
}
