"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cerrarTurno } from "@/lib/turnos";
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
const pesos = (n: number) => `$${Math.abs(n).toLocaleString("es-AR")}`;

/** Lo que hay que escribir para poder cerrar con diferencias. */
const FRASE = "Soy consciente y avisé por el grupo";

/** Sin tildes, sin mayúsculas y sin espacios de más: el cierre es a las once de
 *  la noche y pelearse con un acento no hace a nadie más consciente. */
const normalizar = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");

/**
 * Cierre de turno. El turno termina cuando se cierra: la hora no se elige,
 * igual que al abrir.
 *
 * La diferencia no bloquea: se avisa, se registra y queda anotado quién cerró
 * con faltante o sobrante.
 */
export function CerrarTurnoModal({
  esperadoGrande,
  esperadoChica,
  productos,
}: {
  esperadoGrande: number;
  esperadoChica: number;
  productos: ProductoConStock[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const [cajaGrande, setCajaGrande] = React.useState("");
  const [cajaChica, setCajaChica] = React.useState("");
  const [contados, setContados] = React.useState<Map<string, string>>(new Map());
  const [confirmacion, setConfirmacion] = React.useState("");

  function abrirModal() {
    setCajaGrande("");
    setCajaChica("");
    setContados(new Map());
    setConfirmacion("");
    setError(null);
    setAbierto(true);
  }

  const difGrande = cajaGrande === "" ? null : Number(cajaGrande) - esperadoGrande;
  const difChica = cajaChica === "" ? null : Number(cajaChica) - esperadoChica;

  const stockQueDifiere = [...contados]
    .map(([id, valor]) => {
      const p = productos.find((x) => x.id === id);
      if (!p || valor === "") return null;
      const dif = Number(valor) - p.stock;
      return dif === 0 ? null : { nombre: p.nombre, dif };
    })
    .filter((x): x is { nombre: string; dif: number } => x !== null);

  const hayDescuadre =
    (difGrande !== null && difGrande !== 0) ||
    (difChica !== null && difChica !== 0) ||
    stockQueDifiere.length > 0;

  // Con diferencias el cierre no se bloquea, pero deja de ser un clic: hay que
  // escribir la frase, que es lo que convierte "le doy a cerrar igual" en un
  // acto deliberado y deja constancia de que el aviso salió.
  const confirmado = !hayDescuadre || normalizar(confirmacion) === normalizar(FRASE);

  const listo = cajaGrande !== "" && cajaChica !== "" && todoContado(productos, contados);
  const puedeCerrar = listo && confirmado;

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = await cerrarTurno({
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
      <Button variant="secondary" onClick={abrirModal}>
        Cerrar turno
      </Button>

      <Modal
        open={abierto}
        onOpenChange={(v) => (v ? abrirModal() : setAbierto(false))}
        title="Cerrar turno"
        description="Contá la caja y el stock antes de cerrar."
        className="w-[min(44rem,94vw)]"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-copy-13 text-[var(--ds-gray-900)]">
              {!listo
                ? "Falta contar alguna caja o algún producto"
                : !confirmado
                  ? "Escribí la confirmación para poder cerrar"
                  : hayDescuadre
                    ? "Cierra con diferencia"
                    : "Todo cuadra"}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button
                onClick={guardar}
                disabled={!puedeCerrar}
                loading={guardando}
                variant={hayDescuadre ? "warning" : "primary"}
              >
                {hayDescuadre ? "Cerrar igual" : "Cerrar turno"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-heading-16">¿Cuánto hay en caja?</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Input
                  label={`Caja grande (el sistema espera ${pesos(esperadoGrande)})`}
                  prefix="$"
                  inputMode="numeric"
                  placeholder="0"
                  value={cajaGrande}
                  onChange={(e) => setCajaGrande(soloNumeros(e.target.value))}
                />
                <Diferencia valor={difGrande} />
              </div>
              <div>
                <Input
                  label={`Caja chica (el sistema espera ${pesos(esperadoChica)})`}
                  prefix="$"
                  inputMode="numeric"
                  placeholder="0"
                  value={cajaChica}
                  onChange={(e) => setCajaChica(soloNumeros(e.target.value))}
                />
                <Diferencia valor={difChica} />
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-heading-16">Stock final</h3>
            <p className="text-copy-13 text-[var(--ds-gray-900)]">
              Contá todos los que están marcados en el catálogo.
            </p>
            <ConteoStock productos={productos} contados={contados} onCambio={setContados} />
          </section>

          {hayDescuadre && (
            <Note type="warning" fill>
              <div className="flex flex-col gap-1">
                <span>Lo contado no coincide con lo que el sistema esperaba.</span>
                {difGrande !== null && difGrande !== 0 && (
                  <span>
                    Caja grande: {difGrande < 0 ? "faltan" : "sobran"} {pesos(difGrande)}.
                  </span>
                )}
                {difChica !== null && difChica !== 0 && (
                  <span>
                    Caja chica: {difChica < 0 ? "faltan" : "sobran"} {pesos(difChica)}.
                  </span>
                )}
                {stockQueDifiere.map((s) => (
                  <span key={s.nombre}>
                    {s.nombre}: {s.dif < 0 ? "faltan" : "sobran"} {Math.abs(s.dif)}.
                  </span>
                ))}
                <span className="mt-1">
                  Estás por cerrar el turno con inconsistencias. Vas a poder cerrarlo, pero
                  tenés que avisar.
                </span>
              </div>
            </Note>
          )}

          {hayDescuadre && (
            <Input
              label={`Para cerrar, escribí: ${FRASE}`}
              size="large"
              autoComplete="off"
              placeholder={FRASE}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
            />
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

function Diferencia({ valor }: { valor: number | null }) {
  if (valor === null || valor === 0) return null;
  return (
    <p
      className={`text-copy-13 mt-1 ${valor < 0 ? "text-[var(--ds-red-900)]" : "text-[var(--ds-green-900)]"}`}
    >
      {valor < 0 ? "Faltan" : "Sobran"} {pesos(valor)}
    </p>
  );
}
