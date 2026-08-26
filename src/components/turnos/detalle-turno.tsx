"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { CajaCard, type EstadoCaja } from "@/components/mostrador/caja-card";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
import { corregirTurno, agregarVentaOlvidada } from "@/lib/turnos";

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
  /** El día del turno, "YYYY-MM-DD": la hora que se tipea cuelga de acá. */
  dia: string;
  alumnos: { id: string; nombre_completo: string }[];
  productos: { id: string; nombre: string; precio: number }[];
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

  // --- venta que nadie anotó ---
  const [alumnoId, setAlumnoId] = React.useState("");
  const [productoId, setProductoId] = React.useState("");
  const [metodo, setMetodo] = React.useState("efectivo");
  const [hora, setHora] = React.useState("");
  const [cargando, setCargando] = React.useState(false);

  async function cargarVenta() {
    const producto = productos.find((p) => p.id === productoId);
    if (!alumnoId || !producto) {
      setError("Elegí el alumno y el producto.");
      return;
    }
    if (hora === "") {
      setError("Poné a qué hora fue la venta.");
      return;
    }
    setCargando(true);
    setError(null);
    // La hora se escribe sola; el día sale del turno, que es al que se le carga.
    const { error: fallo } = await agregarVentaOlvidada(id, {
      alumnoId,
      productoId,
      creadoEn: `${dia}T${hora}:00-03:00`,
      efectivo: metodo === "efectivo" ? producto.precio : 0,
      transferencia: metodo === "transferencia" ? producto.precio : 0,
    });
    setCargando(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    setAlumnoId("");
    setProductoId("");
    setHora("");
    router.refresh();
  }

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

      <Modal
        open={verlo}
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

              <section className="flex flex-col gap-2 border-t border-border pt-4">
                <h3 className="text-label-14 text-muted-foreground">Venta que nadie anotó</h3>
                {/* Si falta un agua y sobran $1.000 no hay faltante: hay una
                    venta sin cargar. Cargarla acá cierra las dos diferencias de
                    una, porque la caja pasa a esperar esos $1.000 y el cierre
                    pasa a esperar un agua menos. */}
                {/* 10rem para la hora: el navegador dibuja "01:01 PM" mas el
                    iconito del selector y en menos se corta. */}
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_10rem]">
                  <div>
                    <span className="text-copy-13 text-muted-foreground">Alumno</span>
                    <Combobox
                      options={alumnos.map((a) => ({
                        value: a.id,
                        label: a.nombre_completo.replace(",", ""),
                      }))}
                      value={alumnoId}
                      onValueChange={setAlumnoId}
                      placeholder="Buscar alumno..."
                      emptyMessage="No hay alumnos"
                      width="100%"
                      clearable
                    />
                  </div>
                  <div>
                    <span className="text-copy-13 text-muted-foreground">Producto</span>
                    <Select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                      <option value="">Elegí uno</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} · ${p.precio.toLocaleString("es-AR")}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <span className="text-copy-13 text-muted-foreground">Método</span>
                    <Select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transfer.</option>
                    </Select>
                  </div>
                  <Input
                    label="Hora"
                    type="time"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                  />
                </div>
                <div>
                  <Button variant="secondary" onClick={cargarVenta} loading={cargando}>
                    Cargar venta
                  </Button>
                </div>
              </section>

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
          </>
          )}
        </div>
      </Modal>
    </>
  );
}
