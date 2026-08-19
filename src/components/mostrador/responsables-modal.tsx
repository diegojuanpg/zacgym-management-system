"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { sumarResponsable, sacarResponsable, crearEmpleado, type Empleado } from "@/lib/turnos";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";
import { PlusIcon } from "@/components/icons";
import { ahoraLocal } from "@/lib/utils";

const ZONA = "America/Argentina/Buenos_Aires";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export interface TramoResponsable {
  empleado_id: string;
  nombre: string;
  desde: string;
  hasta: string | null;
}

/**
 * Quién está a cargo del turno abierto, con la hora de cada uno.
 *
 * El turno no se corta cuando entra o sale alguien: la caja es la misma y se
 * cuenta una sola vez, al abrir y al cerrar. Lo que se anota acá es quién la
 * estuvo atendiendo y desde cuándo.
 */
export function ResponsablesModal({
  empleados,
  tramos,
  abiertoEn,
}: {
  empleados: Empleado[];
  tramos: TramoResponsable[];
  abiertoEn: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const [elegido, setElegido] = React.useState("");
  const [llego, setLlego] = React.useState("");
  const [tope, setTope] = React.useState("");
  const [nuevo, setNuevo] = React.useState("");
  const [sumando, setSumando] = React.useState(false);
  // A quién se le está marcando la salida, y a qué hora.
  const [saliendo, setSaliendo] = React.useState<TramoResponsable | null>(null);
  const [seFue, setSeFue] = React.useState("");

  const adentro = tramos.filter((t) => t.hasta === null);

  function abrirModal() {
    setElegido("");
    setLlego(ahoraLocal());
    setTope(ahoraLocal());
    setNuevo("");
    setSumando(false);
    setSaliendo(null);
    setError(null);
    setAbierto(true);
  }

  async function sumar(empleadoId: string) {
    if (empleadoId === "") return;
    setGuardando(true);
    setError(null);
    const { error } = await sumarResponsable(empleadoId, new Date(llego).toISOString());
    setGuardando(false);
    if (error) return setError(error);
    setElegido("");
    router.refresh();
  }

  async function crearYSumar() {
    const nombre = nuevo.trim();
    if (nombre === "") return;

    // Si ya existe se suma y listo: al que solo quiere ponerlo a cargo no le
    // sirve un "ya existe" que lo manda a buscarlo al otro campo.
    const yaEsta = empleados.find((e) => e.nombre.toLowerCase() === nombre.toLowerCase());
    if (yaEsta) {
      setNuevo("");
      setSumando(false);
      await sumar(yaEsta.id);
      return;
    }

    setGuardando(true);
    const { empleado, error } = await crearEmpleado(nombre);
    setGuardando(false);
    if (error) return setError(error);
    setNuevo("");
    setSumando(false);
    if (empleado) await sumar(empleado.id);
  }

  async function sacar() {
    if (!saliendo) return;
    setGuardando(true);
    setError(null);
    const { error } = await sacarResponsable(
      saliendo.empleado_id,
      new Date(seFue).toISOString(),
    );
    setGuardando(false);
    if (error) return setError(error);
    setSaliendo(null);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={abrirModal}>
        Responsables
      </Button>

      <Modal
        open={abierto}
        onOpenChange={(v) => (v ? abrirModal() : setAbierto(false))}
        title="Quién está a cargo"
        description={`El turno arrancó a las ${hora(abiertoEn)}. Cada uno queda anotado con la hora a la que entró.`}
        className="w-[min(36rem,94vw)]"
        footer={
          <Button variant="secondary" onClick={() => setAbierto(false)} className="ml-auto">
            Listo
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <ul className="flex flex-col divide-y divide-[var(--ds-gray-alpha-400)]">
            {tramos.map((t) => (
              <li
                key={`${t.empleado_id}-${t.desde}`}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex flex-col leading-tight">
                  <span className="text-[var(--ds-gray-1000)]">{t.nombre}</span>
                  <span className="text-copy-13 text-[var(--ds-gray-900)]">
                    {hora(t.desde)} → {t.hasta === null ? "sigue" : hora(t.hasta)}
                  </span>
                </div>
                {t.hasta === null && adentro.length > 1 && (
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => {
                      setSaliendo(t);
                      setSeFue(ahoraLocal());
                      setError(null);
                    }}
                  >
                    Se fue
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {saliendo ? (
            <section className="flex flex-col gap-2 rounded-md border border-border p-3">
              <h3 className="text-heading-16">{saliendo.nombre} se fue</h3>
              <div className="flex items-end gap-2">
                <Input
                  label="A qué hora"
                  type="datetime-local"
                  size="large"
                  value={seFue}
                  max={tope}
                  onChange={(e) => setSeFue(e.target.value)}
                  className="flex-1"
                />
                <Button variant="secondary" size="lg" loading={guardando} onClick={sacar}>
                  Marcar salida
                </Button>
                <Button variant="tertiary" size="lg" onClick={() => setSaliendo(null)}>
                  Cancelar
                </Button>
              </div>
            </section>
          ) : (
            <section className="flex flex-col gap-2">
              <h3 className="text-heading-16">Sumar a alguien</h3>
              {/* Primero la hora y despues quien: elegir en el combo ya guarda,
                  asi que si el nombre fuera primero la hora llegaria tarde. */}
              <div className="flex items-end gap-2">
                <Input
                  label="Llegó"
                  type="datetime-local"
                  size="large"
                  value={llego}
                  max={tope}
                  onChange={(e) => setLlego(e.target.value)}
                  className="w-52 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <Label>Responsable</Label>
                  <Combobox
                    options={empleados
                      .filter((e) => !adentro.some((t) => t.empleado_id === e.id))
                      .map((e) => ({ value: e.id, label: e.nombre }))}
                    value={elegido}
                    onValueChange={sumar}
                    placeholder="Buscar empleado..."
                    emptyMessage="No quedan empleados para sumar"
                    width="100%"
                  />
                </div>
              </div>

              {sumando ? (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label="Nombre del empleado nuevo"
                      autoFocus
                      placeholder="Nombre y apellido"
                      value={nuevo}
                      onChange={(e) => setNuevo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void crearYSumar();
                        }
                      }}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    prefix={<PlusIcon />}
                    disabled={nuevo.trim() === ""}
                    loading={guardando}
                    onClick={crearYSumar}
                  >
                    Agregar
                  </Button>
                  <Button
                    variant="tertiary"
                    onClick={() => {
                      setSumando(false);
                      setNuevo("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="link"
                  size="xs"
                  className="self-start"
                  onClick={() => setSumando(true)}
                >
                  ¿No está en la lista?
                </Button>
              )}
            </section>
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
