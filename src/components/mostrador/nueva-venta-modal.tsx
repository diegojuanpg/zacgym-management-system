"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { registrarLote, type ItemVenta, type ItemMovimiento } from "@/lib/ventas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Note } from "@/components/ui/note";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceIcon, PlusIcon } from "@/components/icons";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export interface Alumno {
  id: string;
  nombre_completo: string;
  /** Cuenta corriente: positivo debe, negativo tiene a favor. */
  saldo: number;
}
export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  stock: number | null;
}

interface FilaVenta extends ItemVenta {
  clase: "venta";
  alumno: string;
  producto: string;
  precio: number;
  /** Saldo a favor que esta línea consume. No viaja a la base: la cuenta del
   *  alumno lo netea sola, esto es solo para no mostrarlo como deuda nueva. */
  creditoAplicado: number;
}

interface FilaMovimiento extends ItemMovimiento {
  clase: "movimiento";
}

type Fila = FilaVenta | FilaMovimiento;

type Metodo = "efectivo" | "transferencia" | "mixto" | "debe";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

function nombreMetodo(efectivo: number, transferencia: number) {
  if (efectivo > 0 && transferencia > 0) return "Mixto";
  if (efectivo > 0) return "Efectivo";
  if (transferencia > 0) return "Transferencia";
  return "—";
}

/** Lo que le falta cubrir a una venta. Negativo = pagó de más. */
function faltante(f: FilaVenta) {
  return f.precio * f.cantidad - f.efectivo - f.transferencia - f.creditoAplicado;
}

export function NuevaVentaModal({
  alumnos,
  productos,
}: {
  alumnos: Alumno[];
  productos: Producto[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [filas, setFilas] = React.useState<Fila[]>([]);
  const [pestania, setPestania] = React.useState("venta");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = React.useState(false);

  // --- venta ---
  const [alumnoId, setAlumnoId] = React.useState("");
  const [productoId, setProductoId] = React.useState("");
  const [cantidad, setCantidad] = React.useState("1");
  const [metodo, setMetodo] = React.useState<Metodo>("efectivo");
  // Montos tipeados. Vacío = "todo lo que corresponda", que es el caso común.
  const [pagaEfectivo, setPagaEfectivo] = React.useState("");
  const [pagaTransferencia, setPagaTransferencia] = React.useState("");

  // --- movimiento de caja ---
  const [movTipo, setMovTipo] = React.useState<ItemMovimiento["tipo"]>("egreso");
  const [movCaja, setMovCaja] = React.useState<ItemMovimiento["caja"]>("grande");
  const [movMetodo, setMovMetodo] = React.useState<ItemMovimiento["metodo"]>("efectivo");
  const [movMonto, setMovMonto] = React.useState("");
  const [movMotivo, setMovMotivo] = React.useState("");

  const ventas = filas.filter((f): f is FilaVenta => f.clase === "venta");
  const movimientos = filas.filter((f): f is FilaMovimiento => f.clase === "movimiento");

  // Lo que entra o sale en cada forma, contando ventas y movimientos.
  const totalPor = (m: ItemMovimiento["metodo"]) =>
    ventas.reduce((suma, v) => suma + v[m], 0) +
    movimientos
      .filter((mv) => mv.metodo === m)
      .reduce((suma, mv) => suma + (mv.tipo === "ingreso" ? mv.monto : -mv.monto), 0);

  const adeudado = ventas.reduce((suma, v) => suma + Math.max(0, faltante(v)), 0);
  const aFavor = ventas.reduce((suma, v) => suma + Math.max(0, -faltante(v)), 0);

  const productoElegido = productos.find((p) => p.id === productoId);
  const alumnoElegido = alumnos.find((a) => a.id === alumnoId);
  const unidades = Math.max(1, Number(cantidad) || 1);
  const totalLinea = productoElegido ? productoElegido.precio * unidades : null;

  // La cuenta ya viene neteada: un alumno no puede deber y tener a favor a la vez.
  const debePrevio = Math.max(0, alumnoElegido?.saldo ?? 0);
  // Descontamos lo que ya consumieron otras líneas del lote para el mismo alumno.
  const creditoUsado = ventas
    .filter((v) => v.alumno_id === alumnoId)
    .reduce((suma, v) => suma + v.creditoAplicado, 0);
  const aFavorPrevio = Math.max(0, -(alumnoElegido?.saldo ?? 0) - creditoUsado);
  // Lo que tiene a favor se descuenta de lo que hay que cobrarle hoy. Lo que debe
  // de antes no se suma: es otra deuda, se cobra aparte.
  const aCobrar = totalLinea === null ? null : Math.max(0, totalLinea - aFavorPrevio);

  // Cuánto entra en cada forma según el método elegido. Un campo vacío en mixto
  // cuenta como cero; con un solo método, vacío significa todo lo que hay que cobrar.
  const cobro = (sugerido: number) => {
    const efe = Number(pagaEfectivo) || 0;
    const tra = Number(pagaTransferencia) || 0;
    if (metodo === "debe") return { efectivo: 0, transferencia: 0 };
    if (metodo === "mixto") return { efectivo: efe, transferencia: tra };
    const monto = pagaEfectivo === "" ? sugerido : efe;
    return metodo === "efectivo"
      ? { efectivo: monto, transferencia: 0 }
      : { efectivo: 0, transferencia: monto };
  };

  const cobroLinea = aCobrar === null ? null : cobro(aCobrar);
  const restaLinea =
    aCobrar === null || cobroLinea === null
      ? 0
      : aCobrar - cobroLinea.efectivo - cobroLinea.transferencia;

  function agregarVenta(event: React.FormEvent) {
    event.preventDefault();
    const alumno = alumnos.find((a) => a.id === alumnoId);
    const producto = productos.find((p) => p.id === productoId);
    if (!alumno || !producto) return;

    const total = producto.precio * unidades;
    const creditoAplicado = Math.min(aFavorPrevio, total);
    const { efectivo, transferencia } = cobro(total - creditoAplicado);

    setFilas((previas) => [
      ...previas,
      {
        clase: "venta",
        alumno_id: alumno.id,
        producto_id: producto.id,
        cantidad: unidades,
        efectivo,
        transferencia,
        creditoAplicado,
        alumno: alumno.nombre_completo,
        producto: producto.nombre,
        precio: producto.precio,
      },
    ]);
    // El método queda pegado: lo normal es que varios paguen igual.
    setAlumnoId("");
    setProductoId("");
    setCantidad("1");
    setPagaEfectivo("");
    setPagaTransferencia("");
    setError(null);
  }

  function agregarMovimiento(event: React.FormEvent) {
    event.preventDefault();
    const monto = Number(movMonto) || 0;
    if (monto <= 0) {
      setError("Poné cuánta plata entró o salió.");
      return;
    }
    if (movMotivo.trim() === "") {
      setError("Escribí para qué fue.");
      return;
    }

    setFilas((previas) => [
      ...previas,
      {
        clase: "movimiento",
        tipo: movTipo,
        caja: movCaja,
        metodo: movMetodo,
        monto,
        motivo: movMotivo.trim(),
      },
    ]);
    setMovMonto("");
    setMovMotivo("");
    setError(null);
  }

  async function confirmar() {
    setGuardando(true);
    setError(null);
    const { error } = await registrarLote(
      ventas.map(({ alumno_id, producto_id, cantidad, efectivo, transferencia }) => ({
        alumno_id,
        producto_id,
        cantidad,
        efectivo,
        transferencia,
      })),
      movimientos.map(({ tipo, monto, motivo, caja, metodo }) => ({
        tipo,
        monto,
        motivo,
        caja,
        metodo,
      })),
    );
    setGuardando(false);
    if (error) {
      setError(error);
      return;
    }
    setFilas([]);
    setAbierto(false);
    router.refresh();
  }

  function cambiarApertura(abrir: boolean) {
    // Cerrar con la lista cargada sería perder ventas: preguntamos antes.
    if (!abrir && filas.length > 0) {
      setConfirmarDescarte(true);
      return;
    }
    if (!abrir) setError(null);
    setAbierto(abrir);
  }

  function descartar() {
    setFilas([]);
    setError(null);
    setConfirmarDescarte(false);
    setAbierto(false);
  }

  return (
    <>
      <Button onClick={() => setAbierto(true)} prefix={<PlusIcon />}>
        Agregar movimientos
      </Button>

      <Modal
        open={abierto}
        onOpenChange={cambiarApertura}
        title="Cargar movimientos"
        description="Apilá todo lo del turno y confirmá una sola vez."
        className="w-[min(60rem,94vw)]"
        sticky
        footer={
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-copy-14 text-muted-foreground">
              <span>
                {filas.length} {filas.length === 1 ? "línea" : "líneas"}
              </span>
              <span>
                Efectivo{" "}
                <strong className="text-foreground tabular-nums">
                  {pesos(totalPor("efectivo"))}
                </strong>
              </span>
              <span>
                Transferencia{" "}
                <strong className="text-foreground tabular-nums">
                  {pesos(totalPor("transferencia"))}
                </strong>
              </span>
              {/* La deuda no es plata que entró: solo aparece si hay. */}
              {adeudado > 0 && (
                <span>
                  Debe <strong className="text-foreground tabular-nums">{pesos(adeudado)}</strong>
                </span>
              )}
              {aFavor > 0 && (
                <span>
                  A favor{" "}
                  <strong className="text-foreground tabular-nums">{pesos(aFavor)}</strong>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => cambiarApertura(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={filas.length === 0} loading={guardando}>
                Confirmar y cargar
              </Button>
            </div>
          </div>
        }
      >
        <Tabs value={pestania} onValueChange={setPestania} className="mb-4">
          <TabsList>
            <TabsTrigger value="venta">Venta</TabsTrigger>
            <TabsTrigger value="caja">Movimiento de caja</TabsTrigger>
          </TabsList>
        </Tabs>

        {pestania === "venta" ? (
          <form onSubmit={agregarVenta} className="flex flex-col gap-1 pb-4">
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_5rem_9rem_minmax(7rem,auto)]">
              <div>
                <Label>Alumno</Label>
                <Combobox
                  // Sin la coma, escribir "perez j" encuentra a "Perez, Juan": el
                  // combobox busca por substring y la coma cortaba la coincidencia.
                  options={alumnos.map((a) => ({
                    value: a.id,
                    label: a.nombre_completo.replace(",", ""),
                  }))}
                  value={alumnoId}
                  onValueChange={setAlumnoId}
                  placeholder="Buscar alumno..."
                  emptyMessage="Ningún alumno coincide"
                  width="100%"
                  clearable
                />
              </div>

              <div>
                <Label>Producto</Label>
                <Combobox
                  options={productos.map((p) => ({ value: p.id, label: p.nombre }))}
                  value={productoId}
                  onValueChange={setProductoId}
                  placeholder="Buscar producto..."
                  emptyMessage="Ningún producto coincide"
                  width="100%"
                  clearable
                />
              </div>

              <Input
                label="Cant."
                size="large"
                inputMode="numeric"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
              />

              <div>
                <Label htmlFor="metodo">Método</Label>
                <Select
                  id="metodo"
                  size="large"
                  value={metodo}
                  onChange={(e) => {
                    setMetodo(e.target.value as Metodo);
                    setPagaEfectivo("");
                    setPagaTransferencia("");
                  }}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="mixto">Mixto</option>
                  <option value="debe">Debe</option>
                </Select>
              </div>

              {/* Resultado, no campo: sin caja, alineado a la base de los inputs. */}
              <div className="flex flex-col items-end">
                <Label>Total</Label>
                <span className="flex h-10 items-center text-heading-20 tabular-nums">
                  {totalLinea === null ? "—" : pesos(totalLinea)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-end gap-3">
                {metodo === "mixto" ? (
                  <>
                    <div className="w-40">
                      <Input
                        label="Efectivo"
                        size="large"
                        inputMode="numeric"
                        prefix="$"
                        placeholder="0"
                        value={pagaEfectivo}
                        onChange={(e) => setPagaEfectivo(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                    <div className="w-40">
                      <Input
                        label="Transfer."
                        size="large"
                        inputMode="numeric"
                        prefix="$"
                        placeholder="0"
                        value={pagaTransferencia}
                        onChange={(e) => setPagaTransferencia(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  </>
                ) : metodo === "debe" ? null : (
                  <div className="w-40">
                    <Input
                      label="Paga"
                      size="large"
                      inputMode="numeric"
                      prefix="$"
                      placeholder={aCobrar === null ? "0" : String(aCobrar)}
                      value={pagaEfectivo}
                      onChange={(e) => setPagaEfectivo(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                )}
              </div>

              <Button type="submit" variant="secondary" size="lg" prefix={<PlusIcon />}>
                Añadir
              </Button>
            </div>

            {/* Alto reservado siempre: que aparezca el aviso no debe mover la fila. */}
            <div className="flex min-h-5 items-center justify-between gap-4 text-copy-13">
              <span>
                {debePrevio > 0 && (
                  <span className="text-[var(--ds-amber-900)]">
                    Debe {pesos(debePrevio)} de antes
                  </span>
                )}
                {aFavorPrevio > 0 && (
                  <span className="text-[var(--ds-blue-900)]">
                    Tiene {pesos(aFavorPrevio)} a favor
                    {aCobrar !== null && ` · se le cobra ${pesos(aCobrar)}`}
                  </span>
                )}
              </span>
              <span>
                {restaLinea > 0 && (
                  <span className="text-[var(--ds-amber-900)]">
                    Queda debiendo {pesos(restaLinea)}
                  </span>
                )}
                {restaLinea < 0 && (
                  <span className="text-[var(--ds-blue-900)]">
                    Le quedan {pesos(-restaLinea)} a favor
                  </span>
                )}
              </span>
            </div>
          </form>
        ) : (
          <form onSubmit={agregarMovimiento} className="flex flex-col gap-1 pb-4">
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[10rem_8rem_10rem_1fr]">
              <div>
                <Label htmlFor="mov-tipo">Movimiento</Label>
                <Select
                  id="mov-tipo"
                  size="large"
                  value={movTipo}
                  onChange={(e) => setMovTipo(e.target.value as ItemMovimiento["tipo"])}
                >
                  <option value="egreso">Sale plata</option>
                  <option value="ingreso">Entra plata</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="mov-caja">Caja</Label>
                <Select
                  id="mov-caja"
                  size="large"
                  value={movCaja}
                  onChange={(e) => setMovCaja(e.target.value as ItemMovimiento["caja"])}
                >
                  <option value="grande">Grande</option>
                  <option value="chica">Chica</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="mov-metodo">Método</Label>
                <Select
                  id="mov-metodo"
                  size="large"
                  value={movMetodo}
                  onChange={(e) => setMovMetodo(e.target.value as ItemMovimiento["metodo"])}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </Select>
              </div>

              <Input
                label="Para qué"
                size="large"
                placeholder="Comida del turno, reponer caja chica, proveedor..."
                value={movMotivo}
                onChange={(e) => setMovMotivo(e.target.value)}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
              <div className="w-40">
                <Input
                  label="Monto"
                  size="large"
                  inputMode="numeric"
                  prefix="$"
                  placeholder="0"
                  value={movMonto}
                  onChange={(e) => setMovMonto(e.target.value.replace(/\D/g, ""))}
                />
              </div>

              <Button type="submit" variant="secondary" size="lg" prefix={<PlusIcon />}>
                Añadir
              </Button>
            </div>

            <div className="min-h-5" />
          </form>
        )}

        {/* Alto fijo: el modal no salta al apilar líneas ni al aparecer un error;
            lo que se achica es la lista, no la ventana. */}
        <div className="flex h-72 flex-col gap-3">
          {error && (
            <Note type="error" fill>
              {error}
            </Note>
          )}

          {filas.length === 0 ? (
            <EmptyState
              icon={<InvoiceIcon />}
              title="La lista está vacía"
              description="Añadí las ventas y los movimientos de a uno y confirmá todo junto al final."
              className="min-h-0 flex-1"
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
              <TableRoot>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Alumno</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead numeric>Total</TableHead>
                      <TableHead className="text-center" />
                    </TableRow>
                  </TableHeader>
                  <TableBody striped>
                    {filas.map((f, i) => (
                      <TableRow key={i}>
                        {f.clase === "venta" ? (
                          <>
                            <TableCell>{f.alumno}</TableCell>
                            <TableCell>{f.producto}</TableCell>
                            <TableCell>{f.cantidad}</TableCell>
                            <TableCell>{nombreMetodo(f.efectivo, f.transferencia)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {pesos(f.efectivo + f.transferencia)}
                                {f.creditoAplicado > 0 && (
                                  <Badge variant="blue-subtle">
                                    Usó {pesos(f.creditoAplicado)} a favor
                                  </Badge>
                                )}
                                {faltante(f) > 0 && (
                                  <Badge variant="amber-subtle">Debe {pesos(faltante(f))}</Badge>
                                )}
                                {faltante(f) < 0 && (
                                  <Badge variant="blue-subtle">
                                    A favor {pesos(-faltante(f))}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell numeric>{pesos(f.precio * f.cantidad)}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-muted-foreground capitalize">
                              Caja {f.caja}
                            </TableCell>
                            <TableCell>{f.motivo}</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell className="capitalize">{f.metodo}</TableCell>
                            <TableCell>
                              <span
                                className={
                                  f.tipo === "ingreso"
                                    ? "text-[var(--ds-green-900)]"
                                    : "text-[var(--ds-amber-900)]"
                                }
                              >
                                {f.tipo === "ingreso" ? "+" : "−"}
                                {pesos(f.monto)}
                              </span>
                            </TableCell>
                            <TableCell numeric>—</TableCell>
                          </>
                        )}
                        <TableCell className="text-center">
                          <Button
                            variant="tertiary"
                            size="sm"
                            className="hover:bg-[var(--ds-red-200)] hover:text-[var(--ds-red-900)]"
                            onClick={() => setFilas((previas) => previas.filter((_, j) => j !== i))}
                          >
                            Quitar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableRoot>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={confirmarDescarte}
        onOpenChange={setConfirmarDescarte}
        title="Descartar lo cargado"
        description={`Tenés ${filas.length} ${filas.length === 1 ? "línea" : "líneas"} sin confirmar. Si salís ahora se pierden.`}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmarDescarte(false)}>
              Seguir cargando
            </Button>
            <Button variant="error" onClick={descartar}>
              Descartar
            </Button>
          </div>
        }
      />
    </>
  );
}
