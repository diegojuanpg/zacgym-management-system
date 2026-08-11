"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { registrarVentas, type ItemVenta } from "@/lib/ventas";

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

const campo = "rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground";
const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

export function NuevaVentaModal({
  alumnos,
  productos,
}: {
  alumnos: Alumno[];
  productos: Producto[];
}) {
  const router = useRouter();
  const dialogo = React.useRef<HTMLDialogElement>(null);

  const [lineas, setLineas] = React.useState<Linea[]>([]);
  const [alumnoId, setAlumnoId] = React.useState("");
  const [productoId, setProductoId] = React.useState("");
  const [cantidad, setCantidad] = React.useState(1);
  const [metodo, setMetodo] = React.useState<ItemVenta["metodo"]>("efectivo");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

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
    dialogo.current?.close();
    router.refresh();
  }

  function cerrar() {
    // Cerrar con lista cargada seria perder ventas: pedimos confirmación explícita.
    if (lineas.length > 0 && !window.confirm("Hay ventas sin confirmar. ¿Descartarlas?")) return;
    setLineas([]);
    setError(null);
    dialogo.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
      >
        Agregar ventas
      </button>

      <dialog
        ref={dialogo}
        onCancel={(e) => {
          e.preventDefault();
          cerrar();
        }}
        className="m-auto w-[min(52rem,92vw)] rounded-xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Cargar ventas</h2>
          <button type="button" onClick={cerrar} className="text-sm text-muted hover:text-foreground">
            Cerrar
          </button>
        </div>

        <form onSubmit={agregar} className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4">
          <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-muted">
            Alumno
            <select
              className={campo}
              required
              value={alumnoId}
              onChange={(e) => setAlumnoId(e.target.value)}
            >
              <option value="">Elegí un alumno</option>
              {alumnos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre_completo}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs text-muted">
            Producto
            <select
              className={campo}
              required
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
            >
              <option value="">Elegí un producto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} — {pesos(p.precio)}
                  {p.stock !== null ? ` (stock ${p.stock})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex w-20 flex-col gap-1 text-xs text-muted">
            Cantidad
            <input
              className={campo}
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
            />
          </label>

          <label className="flex w-40 flex-col gap-1 text-xs text-muted">
            Método
            <select
              className={campo}
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as ItemVenta["metodo"])}
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="fiado">Fiado</option>
            </select>
          </label>

          <button
            type="submit"
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-foreground/5"
          >
            Añadir a la lista
          </button>
        </form>

        <div className="max-h-[45vh] overflow-y-auto px-5 py-4">
          {lineas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Todavía no cargaste nada. Añadí las ventas de a una y confirmá todo junto al final.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-2 font-normal">Alumno</th>
                  <th className="pb-2 font-normal">Producto</th>
                  <th className="pb-2 text-right font-normal">Cant.</th>
                  <th className="pb-2 font-normal">Método</th>
                  <th className="pb-2 text-right font-normal">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-2">{l.alumno}</td>
                    <td className="py-2">{l.producto}</td>
                    <td className="py-2 text-right">{l.cantidad}</td>
                    <td className="py-2 capitalize">{l.metodo}</td>
                    <td className="py-2 text-right">{pesos(l.precio * l.cantidad)}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setLineas((previas) => previas.filter((_, j) => j !== i))}
                        className="text-xs text-muted hover:text-red-600"
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {error && <p className="px-5 pb-2 text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-sm text-muted">
            {lineas.length} {lineas.length === 1 ? "venta" : "ventas"} · {pesos(total)}
          </span>
          <button
            type="button"
            onClick={confirmar}
            disabled={lineas.length === 0 || guardando}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
          >
            {guardando ? "Guardando..." : "Confirmar y cargar"}
          </button>
        </div>
      </dialog>
    </>
  );
}
