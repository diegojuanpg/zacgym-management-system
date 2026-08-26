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

/** Un producto contado en el turno: cuánto había al abrir y cuánto al cerrar. */
export interface ProductoContado {
  producto: string;
  apertura?: { contado: number; esperado: number };
  cierre?: { contado: number; esperado: number };
}

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
  stock: ProductoContado[];
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
              {/* Todos los productos, no solo los que no cuadraron: ver "30 → 25
                  OK" al lado del que falló es lo que te dice si el problema es
                  de un producto o del conteo entero. */}
              <ul className="flex flex-col gap-1.5">
                {stock.map((p) => {
                  const difs = [
                    p.apertura && p.apertura.contado - p.apertura.esperado,
                    p.cierre && p.cierre.contado - p.cierre.esperado,
                  ];
                  const cuadro = difs.every((d) => !d);
                  return (
                    <li
                      key={p.producto}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-copy-14"
                    >
                      <span>{p.producto}</span>
                      <span className="tabular-nums whitespace-nowrap text-muted-foreground">
                        {p.apertura ? p.apertura.contado : "—"}
                        <span className="px-1.5">→</span>
                        {p.cierre ? p.cierre.contado : "—"}
                      </span>
                      {cuadro ? (
                        <Badge variant="green-subtle">OK</Badge>
                      ) : (
                        <span className="flex gap-1">
                          {difs.map((d, i) =>
                            d ? (
                              <Badge key={i} variant={d < 0 ? "red-subtle" : "amber-subtle"}>
                                {d > 0 ? "+" : ""}
                                {d} {i === 0 ? "al abrir" : "al cerrar"}
                              </Badge>
                            ) : null,
                          )}
                        </span>
                      )}
                    </li>
                  );
                })}
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
