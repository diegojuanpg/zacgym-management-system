"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { registrarVentas, type ItemVenta } from "@/lib/ventas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  const [cantidad, setCantidad] = React.useState(1);
  const [metodo, setMetodo] = React.useState<ItemVenta["metodo"]>("efectivo");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = React.useState(false);

  const total = lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0);

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
        cantidad,
        metodo,
        alumno: alumno.nombre_completo,
        producto: producto.nombre,
        precio: producto.precio,
      },
    ]);
    // El método queda pegado: lo normal es que varios paguen igual.
    setAlumnoId("");
    setProductoId("");
    setCantidad(1);
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
        className="w-[min(52rem,96vw)]"
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
        <form
          onSubmit={agregar}
          className="grid grid-cols-2 items-end gap-3 pb-4 sm:grid-cols-[1fr_1fr_4.5rem_9rem_auto]"
        >
          <Select
            label="Alumno"
            placeholder="Elegí un alumno"
            required
            value={alumnoId}
            onChange={(e) => setAlumnoId(e.target.value)}
          >
            {alumnos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre_completo}
              </option>
            ))}
          </Select>

          <Select
            label="Producto"
            placeholder="Elegí un producto"
            required
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
          >
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {pesos(p.precio)}
                {p.stock !== null ? ` (stock ${p.stock})` : ""}
              </option>
            ))}
          </Select>

          <Input
            label="Cant."
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
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

          <Button type="submit" variant="secondary">
            Añadir
          </Button>
        </form>

        {error && (
          <Note type="error" fill className="mb-4">
            {error}
          </Note>
        )}

        {lineas.length === 0 ? (
          <EmptyState
            variant="informational"
            icon={<InvoiceIcon />}
            title="La lista está vacía"
            description="Añadí las ventas de a una y confirmá todo junto al final."
          />
        ) : (
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
        )}
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
