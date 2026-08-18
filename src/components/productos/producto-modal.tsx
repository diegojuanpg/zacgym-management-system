"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { crearProducto, editarProducto, reponerStock, type Categoria } from "@/lib/productos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";
import { PlusIcon } from "@/components/icons";

export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  categoria: Categoria | null;
  caja: "grande" | "chica" | null;
  stock: number | null;
  activo: boolean;
  contar_en_turno: boolean;
}

const soloNumeros = (v: string) => v.replace(/\D/g, "");

/** Alta y edición del catálogo. Sin producto = alta. */
export function ProductoModal({ producto }: { producto?: Producto }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const [nombre, setNombre] = React.useState(producto?.nombre ?? "");
  const [precio, setPrecio] = React.useState(producto ? String(producto.precio) : "");
  const [categoria, setCategoria] = React.useState<Categoria | "">(producto?.categoria ?? "");
  const [caja, setCaja] = React.useState(producto?.caja ?? "");
  const [llevaStock, setLlevaStock] = React.useState(producto ? producto.stock !== null : false);
  const [stock, setStock] = React.useState(producto?.stock != null ? String(producto.stock) : "0");
  const [activo, setActivo] = React.useState(producto?.activo ?? true);
  const [reponer, setReponer] = React.useState("");
  const [contar, setContar] = React.useState(producto?.contar_en_turno ?? false);

  function abrir() {
    // Al reabrir hay que volver a lo que hay en la base, no a lo tipeado antes.
    setNombre(producto?.nombre ?? "");
    setPrecio(producto ? String(producto.precio) : "");
    setCategoria(producto?.categoria ?? "");
    setCaja(producto?.caja ?? "");
    setLlevaStock(producto ? producto.stock !== null : false);
    setStock(producto?.stock != null ? String(producto.stock) : "0");
    setActivo(producto?.activo ?? true);
    setReponer("");
    setContar(producto?.contar_en_turno ?? false);
    setError(null);
    setAbierto(true);
  }

  const datos = () => ({
    nombre,
    precio: Number(precio) || 0,
    categoria: (categoria === "" ? null : categoria) as Categoria | null,
    caja: (caja === "" ? null : caja) as Producto["caja"],
    stock: llevaStock ? Number(stock) || 0 : null,
    // Sin stock no hay unidades que contar: la base lo rechaza.
    contar_en_turno: llevaStock && contar,
  });

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = producto
      ? await editarProducto(producto.id, { ...datos(), activo })
      : await crearProducto(datos());
    setGuardando(false);
    if (error) {
      setError(error);
      return;
    }
    setAbierto(false);
    router.refresh();
  }

  async function sumar() {
    const cantidad = Number(reponer) || 0;
    if (cantidad <= 0 || !producto) return;
    setGuardando(true);
    setError(null);
    const { error } = await reponerStock(producto.id, cantidad);
    setGuardando(false);
    if (error) {
      setError(error);
      return;
    }
    setStock(String((Number(stock) || 0) + cantidad));
    setReponer("");
    router.refresh();
  }

  return (
    <>
      {producto ? (
        <Button variant="tertiary" size="sm" onClick={abrir}>
          Editar
        </Button>
      ) : (
        <Button onClick={abrir} prefix={<PlusIcon />}>
          Nuevo producto
        </Button>
      )}

      <Modal
        open={abierto}
        onOpenChange={(v) => (v ? abrir() : setAbierto(false))}
        title={producto ? "Editar producto" : "Nuevo producto"}
        description="El precio se congela en cada venta: cambiarlo acá no toca lo ya vendido."
        className="w-[min(34rem,94vw)]"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="secondary" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} loading={guardando}>
              Guardar
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nombre"
            size="large"
            placeholder="Cuota, Agua 600ml, Pase libre..."
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />

          <div>
            <Label htmlFor="categoria">Categoría</Label>
            <Select
              id="categoria"
              size="large"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as Categoria | "")}
            >
              <option value="">Sin categoría</option>
              <option value="mensualidad">Mensualidad</option>
              <option value="consumible">Consumible</option>
              <option value="suplemento">Suplemento</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Precio"
              size="large"
              inputMode="numeric"
              prefix="$"
              placeholder="0"
              value={precio}
              onChange={(e) => setPrecio(soloNumeros(e.target.value))}
            />

            <div>
              <Label htmlFor="caja">Caja</Label>
              <Select
                id="caja"
                size="large"
                value={caja}
                onChange={(e) => setCaja(e.target.value as "grande" | "chica" | "")}
              >
                <option value="">Sin asignar</option>
                <option value="grande">Grande</option>
                <option value="chica">Chica</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lleva-stock">Stock</Label>
              <Select
                id="lleva-stock"
                size="large"
                value={llevaStock ? "si" : "no"}
                onChange={(e) => setLlevaStock(e.target.value === "si")}
              >
                <option value="no">No se controla</option>
                <option value="si">Se controla</option>
              </Select>
            </div>

            {llevaStock &&
              (producto ? (
                // Editar: se suma, no se pisa. El total a mano borra ventas ya descontadas.
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label={`Reponer (hay ${stock})`}
                      size="large"
                      inputMode="numeric"
                      placeholder="0"
                      value={reponer}
                      onChange={(e) => setReponer(soloNumeros(e.target.value))}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={sumar}
                    disabled={(Number(reponer) || 0) <= 0}
                  >
                    Sumar
                  </Button>
                </div>
              ) : (
                <Input
                  label="Stock inicial"
                  size="large"
                  inputMode="numeric"
                  placeholder="0"
                  value={stock}
                  onChange={(e) => setStock(soloNumeros(e.target.value))}
                />
              ))}
          </div>

          {producto && (
            <div>
              <Label htmlFor="activo">Estado</Label>
              <Select
                id="activo"
                size="large"
                value={activo ? "si" : "no"}
                onChange={(e) => setActivo(e.target.value === "si")}
              >
                <option value="si">Activo</option>
                <option value="no">Oculto en el mostrador</option>
              </Select>
            </div>
          )}

          {/* Lo que se tilde acá es lo que hay que contar a mano en cada apertura
              y cada cierre de turno. Marcar los 43 que llevan stock son 86
              números por turno: conviene dejar solo lo que duele si falta. */}
          {llevaStock && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-[var(--ds-gray-alpha-400)] p-3">
              <Checkbox checked={contar} onCheckedChange={() => setContar(!contar)} />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm text-[var(--ds-gray-1000)]">Contar en cada turno</span>
                <span className="text-copy-13 text-[var(--ds-gray-900)]">
                  Se pide contarlo al abrir y al cerrar, y avisa si no coincide con el sistema.
                </span>
              </span>
            </label>
          )}

          {caja === "" && (
            <Note type="warning" fill>
              Sin caja asignada la plata de este producto se cuenta en la caja grande.
            </Note>
          )}

          {error && (
            <Note type="error" fill>
              {error}
            </Note>
          )}
        </div>
      </Modal>
    </>
  );
}
