"use client";

import * as React from "react";
import { actualizarRutinas, cambiarAccesoRutina } from "@/lib/rutinas";
import { MAX_LOTE, type Resultado, type Semana } from "@/lib/rutinas-lote";
import type { AlumnoTarea } from "@/components/mostrador/alta-tarea";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Note } from "@/components/ui/note";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { PlusIcon, XIcon } from "@/components/icons";

/**
 * Las dos acciones sobre la planilla de rutina de un alumno.
 *
 * Las dos van de a lotes: se juntan hasta diez alumnos y recién ahí sale un
 * pedido. Del otro lado hay un Google Sheet por cabeza y cada uno tarda varios
 * segundos, así que mandarlos de a uno sería quedarse esperando diez veces.
 *
 * El alumno se elige del mismo listado que el resto del mostrador, que no trae
 * `sheet_id`: quién tiene planilla y quién no lo resuelve Apps Script, y vuelve
 * como el error de esa fila. Traerlo acá sería mandar dos mil filas más al
 * browser para tapar un botón que casi nunca hace falta tapar.
 */

/** El alumno ya agregado al lote: se guarda el nombre para poder mostrarlo. */
interface Elegido {
  id: string;
  quien: string;
}

/** El armado del lote, que es igual en las dos pestañas. */
function useLote(alumnos: AlumnoTarea[]) {
  const [elegidos, setElegidos] = React.useState<Elegido[]>([]);
  const [alumnoId, setAlumnoId] = React.useState("");

  function agregar() {
    const a = alumnos.find((x) => x.id === alumnoId);
    if (!a) return;
    setAlumnoId("");
    // El mismo alumno dos veces sería trabajo repetido sobre la misma planilla.
    if (elegidos.some((e) => e.id === a.id)) return;
    setElegidos((previos) => [...previos, { id: a.id, quien: a.nombre_completo }]);
  }

  function quitar(id: string) {
    setElegidos((previos) => previos.filter((e) => e.id !== id));
  }

  return {
    elegidos,
    alumnoId,
    setAlumnoId,
    agregar,
    quitar,
    limpiar: () => setElegidos([]),
    lleno: elegidos.length >= MAX_LOTE,
  };
}

/** El buscador, el botón de agregar y la lista de los que ya están. */
function SelectorLote({
  alumnos,
  lote,
  trabajando,
}: {
  alumnos: AlumnoTarea[];
  lote: ReturnType<typeof useLote>;
  trabajando: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Alumno</Label>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Combobox
              // Sin la coma, escribir "perez j" encuentra a "Perez, Juan".
              options={alumnos.map((a) => ({
                value: a.id,
                label: a.nombre_completo.replace(",", ""),
              }))}
              value={lote.alumnoId}
              onValueChange={lote.setAlumnoId}
              placeholder="Buscar alumno..."
              emptyMessage="Ningún alumno coincide"
              width="100%"
              clearable
              disabled={lote.lleno || trabajando}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            prefix={<PlusIcon />}
            disabled={!lote.alumnoId || lote.lleno || trabajando}
            onClick={lote.agregar}
          >
            Agregar
          </Button>
        </div>
      </div>

      {lote.elegidos.length === 0 ? (
        <span className="text-copy-13 text-muted-foreground">
          Todavía no agregaste a nadie. Van hasta {MAX_LOTE} juntos.
        </span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {lote.elegidos.map((e) => (
            <span
              key={e.id}
              className="text-copy-13 flex items-center gap-1 rounded-full bg-[var(--ds-gray-alpha-200)] py-0.5 pr-1 pl-2.5"
            >
              {e.quien}
              <Button
                type="button"
                variant="tertiary"
                size="icon-xs"
                title={`Quitar a ${e.quien}`}
                aria-label={`Quitar a ${e.quien}`}
                disabled={trabajando}
                onClick={() => lote.quitar(e.id)}
                className="rounded-full"
              >
                <XIcon />
              </Button>
            </span>
          ))}
        </div>
      )}

      {lote.lleno && (
        <span className="text-copy-13 text-muted-foreground">
          Llegaste a {MAX_LOTE}, que es el máximo por vez. Mandá estos y seguí con el resto.
        </span>
      )}
    </div>
  );
}

/** Cómo le fue a cada uno, una línea por alumno. */
function Resultados({ resultados }: { resultados: Resultado[] }) {
  const bien = resultados.filter((r) => r.ok);
  const mal = resultados.filter((r) => !r.ok);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <Label>Resultado</Label>
      {bien.length > 0 && (
        <Note type="success" fill>
          <div className="flex flex-col gap-0.5">
            {bien.map((r) => (
              <span key={r.id}>
                {r.quien}
                {r.detalle ? ` — ${r.detalle}` : ""}
              </span>
            ))}
          </div>
        </Note>
      )}
      {mal.length > 0 && (
        <Note type="error" fill>
          <div className="flex flex-col gap-0.5">
            {mal.map((r) => (
              <span key={r.id}>
                {r.quien} — {r.error}
              </span>
            ))}
          </div>
        </Note>
      )}
    </div>
  );
}

/**
 * Avanza el bloque de rutina de los alumnos del lote.
 *
 * La semana por defecto es la actual, que es el caso que se usa: alguien quedó
 * atrasado y hay que ponerle la rutina de esta semana. "La que viene" es lo
 * mismo que hace la corrida de los domingos, para adelantarle el trabajo a
 * alguien que avisó que se va de viaje.
 */
export function ActualizarRutina({ alumnos }: { alumnos: AlumnoTarea[] }) {
  const lote = useLote(alumnos);
  const [semana, setSemana] = React.useState<Semana>("actual");
  const [trabajando, setTrabajando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resultados, setResultados] = React.useState<Resultado[] | null>(null);

  async function mandar() {
    setTrabajando(true);
    setError(null);
    setResultados(null);
    const r = await actualizarRutinas(
      lote.elegidos.map((e) => e.id),
      semana,
    );
    setTrabajando(false);
    if (r.error) return setError(r.error);
    setResultados(r.resultados ?? []);
    // Los que salieron bien ya no tienen nada que hacer en la lista; los que
    // fallaron quedan para reintentar sin volver a buscarlos.
    const fallados = new Set((r.resultados ?? []).filter((x) => !x.ok).map((x) => x.id));
    lote.elegidos.filter((e) => !fallados.has(e.id)).forEach((e) => lote.quitar(e.id));
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <SelectorLote alumnos={alumnos} lote={lote} trabajando={trabajando} />

      <div>
        <Label>Semana</Label>
        <RadioGroup
          value={semana}
          onValueChange={(v) => setSemana(v as Semana)}
          disabled={trabajando}
          className="flex-row gap-6"
        >
          <Radio value="actual" label="Esta semana" />
          <Radio value="proxima" label="La que viene" />
        </RadioGroup>
      </div>

      <Note>
        Avanza al bloque siguiente y lo fecha al lunes elegido. Escribe en la planilla del
        alumno y no se puede deshacer.
      </Note>

      <div className="flex items-center justify-end border-t border-border pt-4">
        <Button
          type="button"
          size="lg"
          disabled={lote.elegidos.length === 0}
          loading={trabajando}
          onClick={mandar}
        >
          {trabajando
            ? "Actualizando..."
            : `Actualizar ${lote.elegidos.length || ""} ${
                lote.elegidos.length === 1 ? "rutina" : "rutinas"
              }`}
        </Button>
      </div>

      {trabajando && (
        <span className="text-copy-13 text-muted-foreground">
          Cada planilla tarda unos segundos. No cierres el modal.
        </span>
      )}

      {error && (
        <Note type="error" fill>
          {error}
        </Note>
      )}

      {resultados && <Resultados resultados={resultados} />}
    </div>
  );
}

/**
 * Le da o le quita al alumno el acceso a su propia planilla.
 *
 * Compartir la deja siempre con las tres casillas de Drive destildadas: los
 * editores no pueden re-compartir, y ni editores ni lectores pueden descargar,
 * imprimir o copiar. No es una opción de esta pantalla, lo aplica Apps Script
 * antes de dar el acceso.
 */
export function AccesoRutina({ alumnos }: { alumnos: AlumnoTarea[] }) {
  const lote = useLote(alumnos);
  const [que, setQue] = React.useState<"compartir" | "descompartir">("compartir");
  const [trabajando, setTrabajando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resultados, setResultados] = React.useState<Resultado[] | null>(null);

  async function mandar() {
    setTrabajando(true);
    setError(null);
    setResultados(null);
    const r = await cambiarAccesoRutina(
      lote.elegidos.map((e) => e.id),
      que === "compartir",
    );
    setTrabajando(false);
    if (r.error) return setError(r.error);
    setResultados(r.resultados ?? []);
    const fallados = new Set((r.resultados ?? []).filter((x) => !x.ok).map((x) => x.id));
    lote.elegidos.filter((e) => !fallados.has(e.id)).forEach((e) => lote.quitar(e.id));
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <SelectorLote alumnos={alumnos} lote={lote} trabajando={trabajando} />

      <div>
        <Label>Qué hacer</Label>
        <RadioGroup
          value={que}
          onValueChange={(v) => setQue(v as "compartir" | "descompartir")}
          disabled={trabajando}
          className="flex-row gap-6"
        >
          <Radio value="compartir" label="Compartir" />
          <Radio value="descompartir" label="Quitar acceso" />
        </RadioGroup>
      </div>

      <Note>
        {que === "compartir"
          ? "Se comparte como editor con el mail de la ficha, sin mandarle notificación, y "
            + "con las tres casillas de Drive destildadas: no puede re-compartir, ni descargar, "
            + "imprimir o copiar."
          : "Se le quita el acceso a todos menos al dueño de la planilla."}
      </Note>

      <div className="flex items-center justify-end border-t border-border pt-4">
        <Button
          type="button"
          size="lg"
          variant={que === "compartir" ? "primary" : "secondary"}
          disabled={lote.elegidos.length === 0}
          loading={trabajando}
          onClick={mandar}
        >
          {que === "compartir" ? "Compartir" : "Quitar acceso"}
          {lote.elegidos.length ? ` a ${lote.elegidos.length}` : ""}
        </Button>
      </div>

      {error && (
        <Note type="error" fill>
          {error}
        </Note>
      )}

      {resultados && <Resultados resultados={resultados} />}
    </div>
  );
}
