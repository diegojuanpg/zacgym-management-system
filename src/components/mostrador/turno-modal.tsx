"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { abrirTurno } from "@/lib/turnos";
import type { Asistencia } from "@/lib/asistencias";
import {
  ConteoStock,
  aConteo,
  todoContado,
  type ProductoConStock,
} from "@/components/mostrador/conteo-stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";

const soloNumeros = (v: string) => v.replace(/\D/g, "");

/**
 * Apertura de turno: con cuánta plata y con cuánto stock arranca.
 *
 * No pregunta quién está a cargo ni desde qué hora: el turno arranca cuando se
 * abre, y quién estaba sale de cruzar ese rango con las asistencias fichadas.
 */
export function TurnoModal({
  trabajando,
  productos,
}: {
  /** Solo para avisar si no hizo check-in nadie: el turno no los guarda. */
  trabajando: Asistencia[];
  productos: ProductoConStock[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const [cajaGrande, setCajaGrande] = React.useState("");
  const [cajaChica, setCajaChica] = React.useState("");
  const [contados, setContados] = React.useState<Map<string, string>>(new Map());

  function abrirModal() {
    setCajaGrande("");
    setCajaChica("");
    setContados(new Map());
    setError(null);
    setAbierto(true);
  }

  const listo = cajaGrande !== "" && cajaChica !== "" && todoContado(productos, contados);

  const faltaTexto =
    cajaGrande === "" || cajaChica === ""
      ? "Falta el saldo de alguna caja"
      : "Falta contar algún producto";

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = await abrirTurno({
      cajaGrande: Number(cajaGrande) || 0,
      cajaChica: Number(cajaChica) || 0,
      stock: aConteo(contados),
    });
    setGuardando(false);
    if (error) return setError(error);
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Button onClick={abrirModal}>Iniciar turno</Button>

      <Modal
        open={abierto}
        onOpenChange={(v) => (v ? abrirModal() : setAbierto(false))}
        title="Iniciar turno"
        description="Hasta que no abras el turno no se pueden cargar movimientos."
        className="w-[min(44rem,94vw)]"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-copy-13 text-[var(--ds-gray-900)]">
              {listo ? "Listo para abrir" : faltaTexto}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={!listo} loading={guardando}>
                Abrir turno
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          {/* El turno ya no elige responsables, pero abrir sin que nadie haya
              fichado deja un turno sin nadie atado: si despues no cuadra, no
              hay a quien preguntarle. Avisa, no frena. */}
          {trabajando.length === 0 ? (
            <Note type="warning" fill>
              Nadie hizo el check-in todavía, así que este turno va a quedar sin nadie a
              cargo. Podés abrirlo igual y hacerlo después, desde Check-in.
            </Note>
          ) : (
            <p className="text-copy-13 text-[var(--ds-gray-900)]">
              Van a quedar a cargo{" "}
              <span className="text-[var(--ds-gray-1000)]">
                {trabajando.map((a) => a.nombre).join(", ")}
              </span>
              , por lo que declararon en Check-in.
            </p>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-heading-16">Saldo inicial</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Caja grande"
                prefix="$"
                inputMode="numeric"
                placeholder="0"
                value={cajaGrande}
                onChange={(e) => setCajaGrande(soloNumeros(e.target.value))}
              />
              <Input
                label="Caja chica"
                prefix="$"
                inputMode="numeric"
                placeholder="0"
                value={cajaChica}
                onChange={(e) => setCajaChica(soloNumeros(e.target.value))}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-heading-16">Stock inicial</h3>
            <p className="text-copy-13 text-[var(--ds-gray-900)]">
              Contá todos los que están marcados en el catálogo. Si querés cambiar la lista,
              se marca desde Productos.
            </p>
            <ConteoStock productos={productos} contados={contados} onCambio={setContados} />
          </section>

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
