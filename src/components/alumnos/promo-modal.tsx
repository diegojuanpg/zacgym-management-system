"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { crearPromo, editarPromo, borrarPromo, type DatosPromo } from "@/lib/promos";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";
import { Select } from "@/components/ui/select";
import { cupoDe } from "@/lib/promo-cupo";
import { PlusIcon, XIcon } from "@/components/icons";

export interface OpcionAlumno {
  id: string;
  nombre_completo: string;
}

export interface OpcionProducto {
  id: string;
  nombre: string;
  precio: number;
}

export interface PromoEditable {
  id: string;
  nombre: string;
  producto_id: string;
  activa: boolean;
  integrantes: string[];
}

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

/** Alta y edición de un grupo de promo. Sin promo = alta. */
export function PromoModal({
  promo,
  alumnos,
  productos,
}: {
  promo?: PromoEditable;
  alumnos: OpcionAlumno[];
  productos: OpcionProducto[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState(false);

  const [nombre, setNombre] = React.useState(promo?.nombre ?? "");
  const [productoId, setProductoId] = React.useState(promo?.producto_id ?? "");
  const [activa, setActiva] = React.useState(promo?.activa ?? true);
  const [integrantes, setIntegrantes] = React.useState<string[]>(promo?.integrantes ?? []);
  const [elegido, setElegido] = React.useState("");

  function abrir() {
    // Al reabrir hay que volver a lo que hay en la base, no a lo tipeado antes.
    setNombre(promo?.nombre ?? "");
    setProductoId(promo?.producto_id ?? "");
    setActiva(promo?.activa ?? true);
    setIntegrantes(promo?.integrantes ?? []);
    setElegido("");
    setError(null);
    setConfirmando(false);
    setAbierto(true);
  }

  const nombreDe = (id: string) =>
    alumnos.find((a) => a.id === id)?.nombre_completo ?? "—";

  const producto = productos.find((p) => p.id === productoId) ?? null;
  const cupo = producto ? cupoDe(producto.nombre) : null;
  const desajuste = cupo !== null && integrantes.length !== cupo;

  const datos = (): DatosPromo => ({ nombre, producto_id: productoId, integrantes, activa });

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = promo ? await editarPromo(promo.id, datos()) : await crearPromo(datos());
    setGuardando(false);
    if (error) return setError(error);
    setAbierto(false);
    router.refresh();
  }

  async function borrar() {
    if (!promo) return;
    setGuardando(true);
    setError(null);
    const { error } = await borrarPromo(promo.id);
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
      {promo ? (
        <Button variant="tertiary" size="sm" onClick={abrir}>
          Editar
        </Button>
      ) : (
        <Button onClick={abrir} prefix={<PlusIcon />}>
          Nueva promo
        </Button>
      )}

      <Modal
        open={abierto}
        onOpenChange={(v) => (v ? abrir() : setAbierto(false))}
        title={promo ? "Editar promo" : "Nueva promo"}
        description="El grupo define el precio. Cada integrante sigue con su propio vencimiento y se le cobra por separado."
        className="w-[min(40rem,94vw)]"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {promo ? (
              confirmando ? (
                <div className="flex items-center gap-2">
                  <Button variant="error" size="sm" onClick={borrar} loading={guardando}>
                    Borrar promo
                  </Button>
                  <Button variant="tertiary" size="sm" onClick={() => setConfirmando(false)}>
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  variant="tertiary"
                  size="sm"
                  onClick={() => setConfirmando(true)}
                  className="text-[var(--ds-red-900)] hover:bg-[var(--ds-red-200)]"
                >
                  Borrar promo
                </Button>
              )
            ) : (
              <span />
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
          <Input
            label="Nombre del grupo"
            size="large"
            placeholder="Familia Gómez, Los del turno noche..."
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />

          <div>
            <Label htmlFor="promo-producto">Promo que le corresponde</Label>
            <Select
              id="promo-producto"
              size="large"
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
            >
              <option value="" disabled>
                Elegir
              </option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} — {pesos(p.precio)}
                </option>
              ))}
            </Select>
            {producto && (
              <p className="text-copy-13 mt-1.5 text-[var(--ds-gray-900)]">
                Cada integrante paga {pesos(producto.precio)}.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Integrantes</Label>
            <Combobox
              options={alumnos
                .filter((a) => !integrantes.includes(a.id))
                .map((a) => ({ value: a.id, label: a.nombre_completo.replace(",", "") }))}
              value={elegido}
              onValueChange={(id) => {
                if (id && !integrantes.includes(id)) setIntegrantes([...integrantes, id]);
                setElegido("");
              }}
              placeholder="Buscar alumno..."
              emptyMessage="Ningún alumno coincide"
              width="100%"
            />

            {integrantes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {integrantes.map((id) => (
                  <span
                    key={id}
                    className="text-copy-13 flex items-center gap-1 rounded-full bg-[var(--ds-gray-alpha-200)] py-0.5 pr-1 pl-2.5"
                  >
                    {nombreDe(id)}
                    <Button
                      type="button"
                      variant="tertiary"
                      size="icon-xs"
                      aria-label={`Sacar a ${nombreDe(id)}`}
                      onClick={() => setIntegrantes(integrantes.filter((x) => x !== id))}
                      className="rounded-full"
                    >
                      <XIcon />
                    </Button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Se avisa, no se corrige solo: cambiar el precio de todos a mitad de
              mes porque alguien se dio de baja sorprende más de lo que ayuda. */}
          {desajuste && (
            <Note type="warning" fill>
              El grupo tiene {integrantes.length}{" "}
              {integrantes.length === 1 ? "integrante" : "integrantes"} y {producto?.nombre} es
              para {cupo}. Podés guardarlo igual, pero revisá si no corresponde otra promo.
            </Note>
          )}

          {promo && (
            <div>
              <Label htmlFor="promo-activa">Estado</Label>
              <Select
                id="promo-activa"
                size="large"
                value={activa ? "si" : "no"}
                onChange={(e) => setActiva(e.target.value === "si")}
              >
                <option value="si">Activa</option>
                <option value="no">Pausada</option>
              </Select>
              <p className="text-copy-13 mt-1.5 text-[var(--ds-gray-900)]">
                Pausada deja de sugerirse en el mostrador, pero el grupo no se pierde.
              </p>
            </div>
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
