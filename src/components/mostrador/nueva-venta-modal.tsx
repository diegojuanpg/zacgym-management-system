"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { registrarVentas, type ItemVenta } from "@/lib/ventas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Modal } from "@/components/ui/modal";
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
}
export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  stock: number | null;
}

interface Linea extends ItemVenta {
  alumno: string;
  producto: string;
  precio: number;
}

type Metodo = "efectivo" | "transferencia" | "mixto" | "fiado";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

function nombreMetodo(efectivo: number, transferencia: number) {
  if (efectivo > 0 && transferencia > 0) return "Mixto";
  if (efectivo > 0) return "Efectivo";
  if (transferencia > 0) return "Transferencia";
  return "—";
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
  const [lineas, setLineas] = React.useState<Linea[]>([]);
  const [alumnoId, setAlumnoId] = React.useState("");
  const [productoId, setProductoId] = React.useState("");
  const [cantidad, setCantidad] = React.useState("1");
  const [metodo, setMetodo] = React.useState<Metodo>("efectivo");
  // Montos tipeados. Vacio = "todo lo que corresponda", que es el caso comun.
  const [pagaEfectivo, setPagaEfectivo] = React.useState("");
  const [pagaTransferencia, setPagaTransferencia] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = React.useState(false);

  const totalPor = (m: "efectivo" | "transferencia") =>
    lineas.reduce((suma, l) => suma + l[m], 0);
  const adeudado = lineas.reduce(
    (suma, l) => suma + Math.max(0, l.precio * l.cantidad - l.efectivo - l.transferencia),
    0,
  );
  const aFavor = lineas.reduce(
    (suma, l) => suma + Math.max(0, l.efectivo + l.transferencia - l.precio * l.cantidad),
    0,
  );
  const productoElegido = productos.find((p) => p.id === productoId);
  const unidades = Math.max(1, Number(cantidad) || 1);
  const totalLinea = productoElegido ? productoElegido.precio * unidades : null;

  // Cuanto entra en cada forma segun el metodo elegido. Un campo vacio en mixto
  // cuenta como cero; con un solo metodo, vacio significa el total.
  const cobro = (total: number) => {
    const efe = Number(pagaEfectivo) || 0;
    const tra = Number(pagaTransferencia) || 0;
    if (metodo === "fiado") return { efectivo: 0, transferencia: 0 };
    if (metodo === "mixto") return { efectivo: efe, transferencia: tra };
    const monto = pagaEfectivo === "" ? total : efe;
    return metodo === "efectivo"
      ? { efectivo: monto, transferencia: 0 }
      : { efectivo: 0, transferencia: monto };
  };

  const cobroLinea = totalLinea === null ? null : cobro(totalLinea);
  const restaLinea = totalLinea === null || cobroLinea === null
    ? 0
    : totalLinea - cobroLinea.efectivo - cobroLinea.transferencia;

  function agregar(event: React.FormEvent) {
    event.preventDefault();
    const alumno = alumnos.find((a) => a.id === alumnoId);
    const producto = productos.find((p) => p.id === productoId);
    if (!alumno || !producto) return;

    const total = producto.precio * unidades;
    const { efectivo, transferencia } = cobro(total);

    setLineas((previas) => [
      ...previas,
      {
        alumno_id: alumno.id,
        producto_id: producto.id,
        cantidad: unidades,
        efectivo,
        transferencia,
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

  async function confirmar() {
    setGuardando(true);
    setError(null);
    const { error } = await registrarVentas(
      lineas.map(({ alumno_id, producto_id, cantidad, efectivo, transferencia }) => ({
        alumno_id,
        producto_id,
        cantidad,
        efectivo,
        transferencia,
      })),
    );
    setGuardando(false);
    if (error) {
      setError(error);
      return;
    }
    setLineas([]);
    setAbierto(false);
    router.refresh();
  }

  function cambiarApertura(abrir: boolean) {
    // Cerrar con la lista cargada seria perder ventas: preguntamos antes.
    if (!abrir && lineas.length > 0) {
      setConfirmarDescarte(true);
      return;
    }
    if (!abrir) setError(null);
    setAbierto(abrir);
  }

  function descartar() {
    setLineas([]);
    setError(null);
    setConfirmarDescarte(false);
    setAbierto(false);
  }

  return (
    <>
      <Button onClick={() => setAbierto(true)} prefix={<PlusIcon />}>
        Agregar ventas
      </Button>

      <Modal
        open={abierto}
        onOpenChange={cambiarApertura}
        title="Cargar ventas"
        description="Apilá todas las ventas y confirmá una sola vez."
        className="w-[min(60rem,94vw)]"
        sticky
        footer={
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-copy-14 text-muted-foreground">
              <span>
                {lineas.length} {lineas.length === 1 ? "venta" : "ventas"}
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
              {/* La deuda no es plata que entro: solo aparece si hay. */}
              {adeudado > 0 && (
                <span>
                  Debe{" "}
                  <strong className="text-foreground tabular-nums">{pesos(adeudado)}</strong>
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
              <Button
                onClick={confirmar}
                disabled={lineas.length === 0}
                loading={guardando}
              >
                Confirmar y cargar
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={agregar} className="flex flex-col gap-1 pb-4">
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
              <option value="fiado">Fiado</option>
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
          ) : metodo === "fiado" ? null : (
            <div className="w-40">
            <Input
              label="Paga"
              size="large"
              inputMode="numeric"
              prefix="$"
              placeholder={totalLinea === null ? "0" : String(totalLinea)}
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
          <div className="flex min-h-5 justify-end text-copy-13">
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
          </div>
        </form>

        {/* Alto fijo: el modal no salta al apilar lineas ni al aparecer un error;
            lo que se achica es la lista, no la ventana. */}
        <div className="flex h-72 flex-col gap-3">
          {error && (
            <Note type="error" fill>
              {error}
            </Note>
          )}

          {lineas.length === 0 ? (
            <EmptyState
              icon={<InvoiceIcon />}
              title="La lista está vacía"
              description="Añadí las ventas de a una y confirmá todo junto al final."
              className="min-h-0 flex-1"
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
          <TableRoot>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alumno</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead numeric>Pago</TableHead>
                  <TableHead numeric>Total</TableHead>
                  <TableHead className="text-center" />
                </TableRow>
              </TableHeader>
              <TableBody striped>
                {lineas.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.alumno}</TableCell>
                    <TableCell>{l.producto}</TableCell>
                    <TableCell>{l.cantidad}</TableCell>
                    <TableCell>{nombreMetodo(l.efectivo, l.transferencia)}</TableCell>
                    <TableCell numeric>
                      <div className="flex items-center justify-end gap-2">
                        {pesos(l.efectivo + l.transferencia)}
                        {l.precio * l.cantidad - l.efectivo - l.transferencia > 0 && (
                          <Badge variant="amber-subtle">
                            Debe {pesos(l.precio * l.cantidad - l.efectivo - l.transferencia)}
                          </Badge>
                        )}
                        {l.efectivo + l.transferencia - l.precio * l.cantidad > 0 && (
                          <Badge variant="blue-subtle">
                            A favor {pesos(l.efectivo + l.transferencia - l.precio * l.cantidad)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell numeric>{pesos(l.precio * l.cantidad)}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="tertiary"
                        size="sm"
                        className="hover:bg-[var(--ds-red-200)] hover:text-[var(--ds-red-900)]"
                        onClick={() => setLineas((previas) => previas.filter((_, j) => j !== i))}
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
        title="Descartar las ventas cargadas"
        description={`Tenés ${lineas.length} ${lineas.length === 1 ? "venta" : "ventas"} sin confirmar. Si salís ahora se pierden.`}
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
