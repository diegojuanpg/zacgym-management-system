"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ficharAsistencia, editarHorario, type Asistencia } from "@/lib/asistencias";
import { crearEmpleado, type Empleado } from "@/lib/turnos";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";
import { PlusIcon } from "@/components/icons";
import { comoHora, duracion, horaCercaDe, horaDespuesDe } from "@/lib/horas";

const ZONA = "America/Argentina/Buenos_Aires";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * Check-in. Guarda tres horas y cada una responde algo distinto:
 *
 * - La llegada: el momento del botón. No se pregunta ni se muestra al fichar
 *   —es un dato de la base, no una decisión— pero queda guardada y sale en el
 *   historial cuando no coincide con el inicio declarado.
 * - Inicia y Termina: el turno declarado. Se eligen, y después se corrigen.
 *
 * El inicio puede ser anterior a la llegada: el que llega 7:05 para un turno
 * que arrancaba a las 7 declara las 7. De este par sale quién estuvo en cada
 * turno de caja, así que es lo que decide a nombre de quién queda un faltante.
 * La llegada queda como registro de puntualidad y no decide nada.
 */
export function CheckInModal({
  empleados,
  asistencias,
}: {
  empleados: Empleado[];
  /** Los check-in de hoy, abiertos y cerrados. El día arranca a las 00:00. */
  asistencias: Asistencia[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const [elegido, setElegido] = React.useState("");
  const [inicia, setInicia] = React.useState("");
  const [termina, setTermina] = React.useState("");
  const [nuevo, setNuevo] = React.useState("");
  const [sumando, setSumando] = React.useState(false);
  // A quién se le está corrigiendo el horario, y con qué horas.
  const [editando, setEditando] = React.useState<Asistencia | null>(null);
  const [editaInicia, setEditaInicia] = React.useState("");
  const [editaTermina, setEditaTermina] = React.useState("");

  function abrirModal() {
    const ahora = new Date();
    setElegido("");
    // El turno arranca ahora salvo que digan otra cosa, que es el caso de siempre.
    setInicia(comoHora(ahora.toISOString()));
    setTermina("");
    setNuevo("");
    setSumando(false);
    setEditando(null);
    setError(null);
    setAbierto(true);
  }

  async function fichar(empleadoId: string) {
    if (empleadoId === "" || inicia === "" || termina === "") return;
    setGuardando(true);
    setError(null);
    const desde = horaCercaDe(inicia, new Date());
    const { error } = await ficharAsistencia(
      empleadoId,
      desde.toISOString(),
      horaDespuesDe(termina, desde).toISOString(),
    );
    setGuardando(false);
    if (error) return setError(error);
    setElegido("");
    setTermina("");
    router.refresh();
  }

  async function crearYFichar() {
    const nombre = nuevo.trim();
    if (nombre === "") return;

    // Si ya existe se ficha y listo: al que solo quiere marcar la llegada no le
    // sirve un "ya existe" que lo manda a buscarlo al otro campo.
    const yaEsta = empleados.find((e) => e.nombre.toLowerCase() === nombre.toLowerCase());
    if (yaEsta) {
      setNuevo("");
      setSumando(false);
      await fichar(yaEsta.id);
      return;
    }

    setGuardando(true);
    const { empleado, error } = await crearEmpleado(nombre);
    setGuardando(false);
    if (error) return setError(error);
    setNuevo("");
    setSumando(false);
    if (empleado) await fichar(empleado.id);
  }

  async function guardarHorario() {
    if (!editando || editaInicia === "" || editaTermina === "") return;
    setGuardando(true);
    setError(null);
    // Las horas nuevas cuentan desde el día del turno que se está corrigiendo,
    // no desde hoy: así se puede arreglar el de anoche sin que salte al futuro.
    const desde = horaCercaDe(editaInicia, new Date(editando.inicia));
    const { error } = await editarHorario(
      editando.id,
      desde.toISOString(),
      horaDespuesDe(editaTermina, desde).toISOString(),
    );
    setGuardando(false);
    if (error) return setError(error);
    setEditando(null);
    router.refresh();
  }

  // Solo el que sigue adentro bloquea un check-in nuevo: el que ya se fue puede
  // volver a entrar más tarde el mismo día.
  const trabajando = asistencias.filter((a) => a.trabajando);
  const terminadas = asistencias.filter((a) => !a.trabajando);
  const puedeFichar = inicia !== "" && termina !== "" && !guardando;

  return (
    <>
      <Button variant="secondary" onClick={abrirModal}>
        Check-in
      </Button>

      <Modal
        open={abierto}
        onOpenChange={(v) => (v ? abrirModal() : setAbierto(false))}
        title="Check-in"
        description="Indicá cuándo inicia y termina tu turno hoy."
        className="w-[min(42rem,94vw)]"
        footer={
          <Button variant="secondary" onClick={() => setAbierto(false)} className="ml-auto">
            Listo
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            {/* Grid y no flex: Input se dibuja dentro de un div w-full, asi que
                en una fila flex se come todo el ancho y empuja al combo afuera. */}
            <div className="grid grid-cols-[7rem_7rem_1fr] items-end gap-2">
              <div>
                <Input
                  label="Inicia"
                  type="time"
                  size="large"
                  value={inicia}
                  onChange={(e) => setInicia(e.target.value)}
                />
              </div>
              <div>
                <Input
                  label="Termina"
                  type="time"
                  size="large"
                  value={termina}
                  onChange={(e) => setTermina(e.target.value)}
                />
              </div>
              <div className="min-w-0">
                <Label>Empleado</Label>
                <Combobox
                  options={empleados
                    .filter((e) => !trabajando.some((a) => a.empleado_id === e.id))
                    .map((e) => ({ value: e.id, label: e.nombre }))}
                  value={elegido}
                  onValueChange={fichar}
                  placeholder={puedeFichar ? "Buscar empleado..." : "Poné las horas primero"}
                  emptyMessage="Ya hicieron el check-in todos"
                  disabled={!puedeFichar}
                  width="100%"
                />
              </div>
            </div>

            <div className="flex min-h-6 items-center justify-between gap-3">
              <span className="text-copy-13 text-[var(--ds-gray-900)]">
                {puedeFichar &&
                  `Son ${duracion(
                    horaCercaDe(inicia, new Date()),
                    horaDespuesDe(termina, horaCercaDe(inicia, new Date())),
                  )} de trabajo.`}
              </span>
              {sumando ? null : (
                <Button variant="link" size="xs" onClick={() => setSumando(true)}>
                  ¿No está en la lista?
                </Button>
              )}
            </div>

            {sumando && (
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
                        void crearYFichar();
                      }
                    }}
                  />
                </div>
                <Button
                  variant="secondary"
                  prefix={<PlusIcon />}
                  disabled={nuevo.trim() === "" || !puedeFichar}
                  loading={guardando}
                  onClick={crearYFichar}
                >
                  Check-in
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
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline gap-3">
              <h3 className="text-heading-16">Historial</h3>
              <span className="text-copy-13 text-[var(--ds-gray-900)]">
                {asistencias.length === 0
                  ? "Hoy no hizo check-in nadie"
                  : `${asistencias.length} ${asistencias.length === 1 ? "turno" : "turnos"} hoy`}
                {trabajando.length > 0 && ` · ${trabajando.length} trabajando`}
              </span>
            </div>
            {asistencias.length === 0 ? (
              <p className="text-copy-13 text-[var(--ds-gray-900)]">
                El día arranca a las 00:00. Sin check-in, el turno queda sin nadie a cargo.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--ds-gray-alpha-400)]">
                {/* Los que siguen adentro arriba: son los que se tocan. Abajo,
                    los turnos que ya cerraron, que estan para mirar y corregir. */}
                {[...trabajando, ...terminadas].map((a) => (
                  <li key={a.id} className="flex flex-col gap-2 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col leading-tight">
                        <span
                          className={
                            a.trabajando
                              ? "text-[var(--ds-gray-1000)]"
                              : "text-[var(--ds-gray-900)]"
                          }
                        >
                          {a.nombre}
                        </span>
                        <span className="text-copy-13 text-[var(--ds-gray-900)]">
                          {hora(a.inicia)} →{" "}
                          {a.termina === null ? "sin hora de fin" : hora(a.termina)}
                          {a.termina !== null &&
                            ` · ${duracion(new Date(a.inicia), new Date(a.termina))}`}
                          {/* La llegada solo se muestra si no coincide con el
                              inicio: repetir la misma hora dos veces no informa. */}
                          {hora(a.entro) !== hora(a.inicia) && ` · llegó ${hora(a.entro)}`}
                        </span>
                      </div>
                      {/* Lo que se puso al fichar es un plan: se arranca antes,
                          se sale despues. Las dos horas se arreglan aca. */}
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={() => {
                          setEditando(editando?.id === a.id ? null : a);
                          setEditaInicia(comoHora(a.inicia));
                          setEditaTermina(a.termina === null ? "" : comoHora(a.termina));
                          setError(null);
                        }}
                      >
                        {editando?.id === a.id ? "Cancelar" : "Editar"}
                      </Button>
                    </div>

                    {editando?.id === a.id && (
                      <div className="flex items-end gap-2">
                        <div className="w-28">
                          <Input
                            label="Inicia"
                            type="time"
                            size="large"
                            autoFocus
                            value={editaInicia}
                            onChange={(e) => setEditaInicia(e.target.value)}
                          />
                        </div>
                        <div className="w-28">
                          <Input
                            label="Termina"
                            type="time"
                            size="large"
                            value={editaTermina}
                            onChange={(e) => setEditaTermina(e.target.value)}
                          />
                        </div>
                        <Button
                          variant="secondary"
                          size="lg"
                          disabled={editaInicia === "" || editaTermina === ""}
                          loading={guardando}
                          onClick={guardarHorario}
                        >
                          Guardar
                        </Button>
                        <span className="text-copy-13 pb-2.5 text-[var(--ds-gray-900)]">
                          {editaInicia !== "" &&
                            editaTermina !== "" &&
                            `${duracion(
                              horaCercaDe(editaInicia, new Date(a.inicia)),
                              horaDespuesDe(editaTermina, horaCercaDe(editaInicia, new Date(a.inicia))),
                            )} de trabajo.`}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
