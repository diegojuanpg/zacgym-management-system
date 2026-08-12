"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { registrarVentas, type ItemVenta } from "@/lib/ventas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

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
  const [metodo, setMetodo] = React.useState<ItemVenta["metodo"]>("efectivo");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = React.useState(false);

  const total = lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0);
  const productoElegido = productos.find((p) => p.id === productoId);
  const unidades = Math.max(1, Number(cantidad) || 1);
  const totalLinea = productoElegido ? productoElegido.precio * unidades : null;

  function agregar(event: React.FormEvent) {
    event.preventDefault();
    const alumno = alumnos.find((a) => a.id === alumnoId);
    const producto = productos.find((p) => p.id === productoId);
    if (!alumno || !producto) return;

    setLineas((previas) => [
      ...previas,
      {
        alumno_id: alumno.id,
        producto_id: producto.id,
        cantidad: unidades,
        metodo,
        alumno: alumno.nombre_completo,
        producto: producto.nombre,
        precio: producto.precio,
      },
    ]);
    // El método queda pegado: lo normal es que varios paguen igual.
    setAlumnoId("");
    setProductoId("");
    setCantidad("1");
    setError(null);
  }

  async function confirmar() {
    setGuardando(true);
    setError(null);
    const { error } = await registrarVentas(
      lineas.map(({ alumno_id, producto_id, cantidad, metodo }) => ({
        alumno_id,
        producto_id,
        cantidad,
        metodo,
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
            <span className="text-copy-14 text-muted-foreground">
              {lineas.length} {lineas.length === 1 ? "venta" : "ventas"} ·{" "}
              <strong className="text-foreground">{pesos(total)}</strong>
            </span>
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
        <form onSubmit={agregar} className="flex flex-col gap-4 pb-4">
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1.3fr_1fr_5rem_9rem_minmax(7rem,auto)]">
          <label className="flex flex-col gap-1">
            <span className="text-label-13 text-muted-foreground">Alumno</span>
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
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-label-13 text-muted-foreground">Producto</span>
            <Combobox
              options={productos.map((p) => ({ value: p.id, label: p.nombre }))}
              value={productoId}
              onValueChange={setProductoId}
              placeholder="Buscar producto..."
              emptyMessage="Ningún producto coincide"
              width="100%"
              clearable
            />
          </label>

          <Input
            label="Cant."
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
          />

          <Select
            label="Método"
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as ItemVenta["metodo"])}
          >
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="fiado">Fiado</option>
          </Select>

          {/* Resultado, no campo: sin caja, alineado a la base de los inputs. */}
          <div className="flex flex-col gap-1">
            <span className="text-label-13 text-muted-foreground">Total</span>
            <span className="flex h-9 items-center justify-end text-heading-20 tabular-nums">
              {totalLinea === null ? "—" : pesos(totalLinea)}
            </span>
          </div>
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" variant="secondary" prefix={<PlusIcon />}>
              Añadir
            </Button>
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
                  <TableHead numeric>Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody striped>
                {lineas.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.alumno}</TableCell>
                    <TableCell>{l.producto}</TableCell>
                    <TableCell>{l.cantidad}</TableCell>
                    <TableCell>
                      <Badge variant={l.metodo === "fiado" ? "amber-subtle" : "gray-subtle"}>
                        {l.metodo}
                      </Badge>
                    </TableCell>
                    <TableCell numeric>{pesos(l.precio * l.cantidad)}</TableCell>
                    <TableCell>
                      <Button
                        variant="tertiary"
                        size="sm"
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
