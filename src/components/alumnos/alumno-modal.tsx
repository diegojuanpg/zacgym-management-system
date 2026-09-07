"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  editarAlumno,
  borrarAlumno,
  cargarDeuda,
  cargarAFavor,
  type DatosFicha,
} from "@/lib/alumnos";
import { toast } from "@/components/ui/toast";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";
import { Select } from "@/components/ui/select";

export interface AlumnoFicha extends DatosFicha {
  id: string;
  /** Cuenta corriente: positivo debe, negativo tiene a favor. */
  saldo: number;
}

export interface ProductoParaDeuda {
  id: string;
  nombre: string;
  precio: number;
}

/** Edición de la ficha, la cuenta corriente, y borrado para las que no tienen historia. */
export function AlumnoModal({
  alumno,
  productos,
}: {
  alumno: AlumnoFicha;
  productos: ProductoParaDeuda[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [datos, setDatos] = React.useState<DatosFicha>(alumno);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState(false);
  // --- cuenta: cargarle a mano una deuda o plata a favor ---
  const [productoId, setProductoId] = React.useState("");
  const [cantidad, setCantidad] = React.useState("1");
  const [aFavor, setAFavor] = React.useState("");
  const [cargando, setCargando] = React.useState(false);

  const set = <C extends keyof DatosFicha>(campo: C, valor: DatosFicha[C]) =>
    setDatos((previos) => ({ ...previos, [campo]: valor }));

  const texto = (campo: keyof DatosFicha) => (datos[campo] as string | null) ?? "";

  function abrir() {
    // Al reabrir hay que volver a lo que hay en la base, no a lo tipeado antes.
    setDatos(alumno);
    setProductoId("");
    setCantidad("1");
    setAFavor("");
    setError(null);
    setConfirmando(false);
    setAbierto(true);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = await editarAlumno(alumno.id, datos);
    setGuardando(false);
    if (error) return setError(error);
    setAbierto(false);
    router.refresh();
  }

  /** Las dos cargas de cuenta se guardan solas, sin pasar por Guardar. */
  async function cargar(que: "deuda" | "a favor") {
    setCargando(true);
    setError(null);
    const { error } =
      que === "deuda"
        ? await cargarDeuda(alumno.id, productoId, Number(cantidad) || 0)
        : await cargarAFavor(alumno.id, Number(aFavor) || 0);
    setCargando(false);
    if (error) return setError(error);
    setProductoId("");
    setCantidad("1");
    setAFavor("");
    toast.success(que === "deuda" ? "Deuda cargada" : "Saldo a favor cargado");
    router.refresh();
  }

  async function borrar() {
    setGuardando(true);
    setError(null);
    const { error } = await borrarAlumno(alumno.id);
    setGuardando(false);
    if (error) {
      setConfirmando(false);
      return setError(error);
    }
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="tertiary" size="sm" onClick={abrir}>
        Editar
      </Button>

      <Modal
        open={abierto}
        onOpenChange={(v) => (v ? abrir() : setAbierto(false))}
        title={`${alumno.apellido}, ${alumno.nombre}`}
        description="Ficha del alumno."
        className="w-[min(38rem,94vw)]"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {/* La baja destructiva vive lejos de Guardar y pide confirmación aparte. */}
            {confirmando ? (
              <div className="flex items-center gap-2">
                <Button variant="error" onClick={borrar} loading={guardando}>
                  Borrar definitivamente
                </Button>
                <Button variant="tertiary" onClick={() => setConfirmando(false)}>
                  No
                </Button>
              </div>
            ) : (
              <Button
                variant="tertiary"
                onClick={() => setConfirmando(true)}
                className="text-[var(--ds-red-900)] hover:bg-[var(--ds-red-200)]"
              >
                Borrar ficha
              </Button>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button onClick={guardar} loading={guardando}>
                Guardar
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Nombre"
              size="large"
              value={datos.nombre}
              onChange={(e) => set("nombre", e.target.value)}
            />
            <Input
              label="Apellido"
              size="large"
              value={datos.apellido}
              onChange={(e) => set("apellido", e.target.value)}
            />
            <div>
              <Label htmlFor="ficha-genero">Género</Label>
              <Select
                id="ficha-genero"
                size="large"
                value={datos.genero ?? ""}
                onChange={(e) =>
                  set("genero", (e.target.value || null) as DatosFicha["genero"])
                }
              >
                <option value="" disabled>
                  Elegir
                </option>
                <option value="femenino">Femenino</option>
                <option value="masculino">Masculino</option>
                {/* "Otro" ya no se ofrece en el alta. Acá aparece solo si la ficha
                    vieja lo tenía: sacarlo de una dejaba el campo vacío y obligaba
                    a cambiarle el género para poder guardar cualquier otra cosa. */}
                {datos.genero === "otro" && <option value="otro">Otro</option>}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Nacimiento"
              size="large"
              type="date"
              value={texto("nacimiento")}
              onChange={(e) => set("nacimiento", e.target.value)}
            />
            <Input
              label="Celular"
              size="large"
              inputMode="tel"
              placeholder="11 5555 5555"
              value={texto("celular")}
              onChange={(e) => set("celular", e.target.value)}
            />
            <Input
              label="Mail"
              size="large"
              type="email"
              placeholder="alumno@gmail.com"
              value={texto("email")}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Vencimiento"
              size="large"
              type="date"
              value={texto("vence")}
              onChange={(e) => set("vence", e.target.value)}
            />
            <div>
              <Label htmlFor="ficha-activo">Estado</Label>
              <Select
                id="ficha-activo"
                size="large"
                value={datos.activo ? "si" : "no"}
                onChange={(e) => set("activo", e.target.value === "si")}
              >
                <option value="si">Activo</option>
                <option value="no">Inactivo</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label>Cuenta</Label>
              <span className="text-copy-13 tabular-nums">
                {alumno.saldo > 0 ? (
                  <span className="text-[var(--ds-red-900)]">
                    Debe ${alumno.saldo.toLocaleString("es-AR")}
                  </span>
                ) : alumno.saldo < 0 ? (
                  <span className="text-[var(--ds-green-900)]">
                    A favor ${(-alumno.saldo).toLocaleString("es-AR")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Al día</span>
                )}
              </span>
            </div>

            {/* Se llevó algo y lo paga después: queda como una compra impaga y
                se cobra desde el mostrador, producto por producto. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_5rem_auto]">
              <Combobox
                options={productos.map((p) => ({
                  value: p.id,
                  label: `${p.nombre} — $${p.precio.toLocaleString("es-AR")}`,
                }))}
                value={productoId}
                onValueChange={setProductoId}
                placeholder="Qué se llevó..."
                emptyMessage="No hay productos activos"
                width="100%"
                clearable
              />
              <Input
                size="large"
                inputMode="numeric"
                aria-label="Cantidad"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
              />
              <Button
                variant="secondary"
                onClick={() => cargar("deuda")}
                loading={cargando}
                disabled={productoId === ""}
              >
                Cargar deuda
              </Button>
            </div>

            {/* Ajuste de la cuenta: no entra plata a ninguna caja. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                size="large"
                inputMode="numeric"
                prefix="$"
                aria-label="Plata a favor"
                placeholder="Plata a favor"
                value={aFavor}
                onChange={(e) => setAFavor(e.target.value.replace(/\D/g, ""))}
              />
              <Button
                variant="secondary"
                onClick={() => cargar("a favor")}
                loading={cargando}
                disabled={aFavor === ""}
              >
                Cargar a favor
              </Button>
            </div>
          </div>

          {confirmando && (
            <Note type="error" fill>
              Se borra la ficha de {alumno.apellido}, {alumno.nombre} y no se puede deshacer. Si
              alguna vez te compró algo, no vas a poder: marcalo inactivo.
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
