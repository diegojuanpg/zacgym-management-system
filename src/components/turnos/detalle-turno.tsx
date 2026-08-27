"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { CajaCard, type EstadoCaja } from "@/components/mostrador/caja-card";
import { corregirTurno } from "@/lib/turnos";
import {
  NuevaVentaModal,
  type Alumno,
  type Producto,
} from "@/components/mostrador/nueva-venta-modal";

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
  id: string;
  producto: string;
  apertura?: { contado: number; esperado: number };
  cierre?: { contado: number; esperado: number };
  /** Lo que se vendió de ese producto en el turno. */
  vendidas?: number;
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
  id,
  dia,
  desde,
  hasta,
  alumnos,
  productos,
  cuando,
  abierto,
  grande,
  chica,
  stock,
  nota,
  corregido,
  responsables,
}: {
  id: string;
  /** El día del turno, "YYYY-MM-DD": la hora que se cargue cuelga de acá. */
  dia: string;
  /** El rango en que estuvo abierto, "HH:MM", que acota lo que se puede cargar. */
  desde: string;
  hasta: string;
  alumnos: Alumno[];
  productos: Producto[];
  /** El encabezado del modal: "25/8, 14:18 → 19:19". */
  cuando: string;
  abierto: boolean;
  grande: DesgloseCaja;
  chica: DesgloseCaja;
  stock: ProductoContado[];
  nota: string | null;
  corregido: string | null;
  responsables: React.ReactNode;
}) {
  const router = useRouter();
  const [verlo, setVerlo] = React.useState(false);
  const [corrigiendo, setCorrigiendo] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Los campos arrancan con lo que hay declarado. Vacío es "dejalo como está",
  // asi que borrar un campo no pone cero.
  const [campos, setCampos] = React.useState<Record<string, string>>({});
  const escribir = (clave: string, valor: string) =>
    setCampos((previos) => ({ ...previos, [clave]: valor.replace(/\D/g, "") }));
  const leer = (clave: string, actual: number | null) =>
    campos[clave] ?? (actual === null ? "" : String(actual));
  const numero = (clave: string, actual: number | null) => {
    const escrito = campos[clave];
    if (escrito === undefined || escrito === "") return null;
    const n = Number(escrito);
    return n === actual ? null : n;
  };

  function empezarCorreccion() {
    setCampos({});
    setError(null);
    setCorrigiendo(true);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error: fallo } = await corregirTurno(id, {
      grandeInicial: numero("grande-inicial", grande.inicial),
      chicaInicial: numero("chica-inicial", chica.inicial),
      grandeFinal: numero("grande-final", grande.contado),
      chicaFinal: numero("chica-final", chica.contado),
      stock: stock.flatMap((p) =>
        (["apertura", "cierre"] as const).flatMap((momento) => {
          const actual = p[momento]?.contado ?? null;
          const nuevo = numero(`${p.id}-${momento}`, actual);
          return nuevo === null ? [] : [{ producto_id: p.id, momento, contado: nuevo }];
        }),
      ),
    });
    setGuardando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    setCorrigiendo(false);
    router.refresh();
  }

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

      {/* El modal de carga es el mismo del mostrador. Mientras está abierto,
          este se esconde en vez de apilarse: al confirmar vuelve solo, que es
          donde la persona estaba trabajando. */}
      <NuevaVentaModal
        alumnos={alumnos}
        productos={productos}
        corrigiendo={{ turnoId: id, dia, desde, hasta }}
        control={{
          abierto: cargando,
          cambiar: (abierto) => {
            setCargando(abierto);
            if (!abierto) router.refresh();
          },
        }}
      />

      <Modal
        open={verlo && !cargando}
        onOpenChange={setVerlo}
        title={`Turno del ${cuando}`}
        description={abierto ? "En curso: lo que tendría que haber ahora." : undefined}
        className="w-[min(46rem,94vw)]"
        footer={
          corrigiendo ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setCorrigiendo(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button variant="secondary" onClick={() => setCargando(true)} disabled={guardando}>
                Agregar venta
              </Button>
              <Button onClick={guardar} loading={guardando}>
                Guardar corrección
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setVerlo(false)}>
                Cerrar
              </Button>
              <Button variant="secondary" onClick={empezarCorreccion}>
                Hacer corrección
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-5">
          {corrigiendo ? (
            <>
              {/* Se corrige lo declarado —lo que alguien tipeó— y nada más. Lo
                  que el sistema esperaba se recalcula solo, y el stock de hoy y
                  el turno siguiente no se tocan. */}
              <Note type="warning" fill>
                Estás corrigiendo lo que se declaró en este turno. Lo que el sistema esperaba se
                recalcula solo. El stock de hoy y el turno siguiente no cambian.
              </Note>

              <section className="grid gap-3 sm:grid-cols-2">
                {([
                  ["Caja grande", "grande", grande],
                  ["Caja chica", "chica", chica],
                ] as const).map(([etiqueta, clave, caja]) => (
                  <div key={clave} className="flex flex-col gap-2">
                    <h3 className="text-label-14 text-muted-foreground">{etiqueta}</h3>
                    <Input
                      label="Arrancó con"
                      inputMode="numeric"
                      prefix="$"
                      value={leer(`${clave}-inicial`, caja.inicial)}
                      onChange={(e) => escribir(`${clave}-inicial`, e.target.value)}
                    />
                    {!abierto && (
                      <Input
                        label="Contaron al cerrar"
                        inputMode="numeric"
                        prefix="$"
                        value={leer(`${clave}-final`, caja.contado)}
                        onChange={(e) => escribir(`${clave}-final`, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </section>

              {stock.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-label-14 text-muted-foreground">Stock contado</h3>
                  {/* Las etiquetas van una vez arriba y no en cada renglón: son
                      las mismas dos columnas para todos los productos. */}
                  <div className="grid grid-cols-[1fr_6rem_6rem] gap-3 text-copy-13 text-muted-foreground">
                    <span />
                    <span>Al abrir</span>
                    <span>Al cerrar</span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {stock.map((p) => (
                      <li key={p.id} className="grid grid-cols-[1fr_6rem_6rem] items-center gap-3">
                        <span className="text-copy-14">{p.producto}</span>
                        <Input
                          size="small"
                          inputMode="numeric"
                          aria-label={`${p.producto} al abrir`}
                          value={leer(`${p.id}-apertura`, p.apertura?.contado ?? null)}
                          onChange={(e) => escribir(`${p.id}-apertura`, e.target.value)}
                        />
                        <Input
                          size="small"
                          inputMode="numeric"
                          aria-label={`${p.producto} al cerrar`}
                          value={leer(`${p.id}-cierre`, p.cierre?.contado ?? null)}
                          onChange={(e) => escribir(`${p.id}-cierre`, e.target.value)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {error && <Note type="error" fill>{error}</Note>}
            </>
          ) : (
          <>
          {corregido && (
            <p className="text-copy-13 text-[var(--ds-amber-900)]">
              Este turno fue corregido a mano.
            </p>
          )}
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
              {/* De donde a donde fue cada producto y por que. Con las ventas en
                  el medio, un faltante se lee sin abrir el mostrador: 30 menos 5
                  vendidas tiene que dar 25. */}
              <TableRoot>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Inicio</TableHead>
                      <TableHead>Ventas</TableHead>
                      <TableHead>Cierre</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody striped>
                    {stock.map((p) => {
                      const difs = [
                        p.apertura && p.apertura.contado - p.apertura.esperado,
                        p.cierre && p.cierre.contado - p.cierre.esperado,
                      ];
                      const cuadro = difs.every((d) => !d);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>{p.producto}</TableCell>
                          <TableCell className="tabular-nums">
                            {p.apertura ? p.apertura.contado : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {p.vendidas ? `−${p.vendidas}` : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {p.cierre ? p.cierre.contado : "—"}
                          </TableCell>
                          <TableCell>
                            {cuadro ? (
                              <Badge variant="green-subtle">OK</Badge>
                            ) : (
                              <span className="flex flex-wrap gap-1">
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
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableRoot>
            </section>
          )}

          {nota && (
            <section className="flex flex-col gap-2">
              <h3 className="text-label-14 text-muted-foreground">Nota del cierre</h3>
              <p className="text-copy-14 whitespace-pre-wrap">{nota}</p>
            </section>
          )}
          </>
          )}
        </div>
      </Modal>
    </>
  );
}
