"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ficharAsistencia, editarSalida, type Asistencia } from "@/lib/asistencias";
import { crearEmpleado, type Empleado } from "@/lib/turnos";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";
import { PlusIcon } from "@/components/icons";

const ZONA = "America/Argentina/Buenos_Aires";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * "HH:MM" a la primera vez que esa hora cae después de la referencia. El que
 * entra a las 22 y sale a las 2 termina al otro día, no cuatro horas antes.
 */
function horaDespuesDe(hhmm: string, referencia: Date) {
  const [h, m] = hhmm.split(":").map(Number);
  const salida = new Date(referencia);
  salida.setHours(h, m, 0, 0);
  if (salida.getTime() <= referencia.getTime()) salida.setDate(salida.getDate() + 1);
  return salida;
}

/** "HH:MM" de una fecha, para precargar el campo al editar. */
function comoHora(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Cuánto hay entre dos momentos, para confirmar que se entendió bien. */
function duracion(desde: Date, hasta: Date) {
  const minutos = Math.round((hasta.getTime() - desde.getTime()) / 60000);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Fichaje de asistencia. La entrada es el momento del botón —no se elige— y la
 * salida la pone el empleado, porque los horarios varían todos los días.
 *
 * De acá sale quién estuvo en cada turno: el turno ya no pregunta responsables,
 * se cruza su rango con estas jornadas.
 */
export function AsistenciaModal({
  empleados,
  trabajando,
}: {
  empleados: Empleado[];
  /** Los que fichados siguen adentro ahora. */
  trabajando: Asistencia[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const [elegido, setElegido] = React.useState("");
  const [hasta, setHasta] = React.useState("");
  const [nuevo, setNuevo] = React.useState("");
  const [sumando, setSumando] = React.useState(false);
  // A quién se le está corrigiendo el horario, y con qué hora.
  const [editando, setEditando] = React.useState<Asistencia | null>(null);
  const [salida, setSalida] = React.useState("");
  // La hora que se muestra como entrada. Se congela al abrir: llamar a Date en
  // el render no es puro, y de todas formas la que vale es la que pone la base.
  const [llegada, setLlegada] = React.useState("");

  function abrirModal() {
    setElegido("");
    setHasta("");
    setNuevo("");
    setSumando(false);
    setEditando(null);
    setLlegada(
      new Date().toLocaleTimeString("es-AR", {
        timeZone: ZONA,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    );
    setError(null);
    setAbierto(true);
  }

  async function fichar(empleadoId: string) {
    if (empleadoId === "" || hasta === "") return;
    setGuardando(true);
    setError(null);
    const { error } = await ficharAsistencia(
      empleadoId,
      horaDespuesDe(hasta, new Date()).toISOString(),
    );
    setGuardando(false);
    if (error) return setError(error);
    setElegido("");
    setHasta("");
    router.refresh();
  }

  async function crearYFichar() {
    const nombre = nuevo.trim();
    if (nombre === "") return;

    // Si ya existe se ficha y listo: al que solo quiere marcar la entrada no le
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

  async function guardarSalida() {
    if (!editando || salida === "") return;
    setGuardando(true);
    setError(null);
    // La hora nueva cuenta desde que entró, no desde ahora: así "02:00" es la
    // madrugada de después de su entrada, se esté corrigiendo cuando se esté.
    const cuando = horaDespuesDe(salida, new Date(editando.entro));
    const { error } = await editarSalida(editando.id, cuando.toISOString());
    setGuardando(false);
    if (error) return setError(error);
    setEditando(null);
    router.refresh();
  }

  const puedeFichar = hasta !== "" && !guardando;

  return (
    <>
      <Button variant="secondary" onClick={abrirModal}>
        Asistencia
      </Button>

      <Modal
        open={abierto}
        onOpenChange={(v) => (v ? abrirModal() : setAbierto(false))}
        title="Asistencia"
        description="Fichá cuando llegues. De acá sale quién estuvo en cada turno."
        className="w-[min(38rem,94vw)]"
        footer={
          <Button variant="secondary" onClick={() => setAbierto(false)} className="ml-auto">
            Listo
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-heading-16">Fichar llegada</h3>

            {/* Grid y no flex: Input se dibuja dentro de un div w-full, asi que
                en una fila flex se come todo el ancho y empuja al combo afuera. */}
            <div className="grid grid-cols-[5rem_9rem_1fr] items-end gap-2">
              {/* La entrada no se edita: es la hora en la que se apretó. */}
              <div>
                <Label>Entra</Label>
                <div className="flex h-10 items-center rounded-lg px-3 text-base tabular-nums text-[var(--ds-gray-1000)] shadow-[0_0_0_1px_var(--ds-gray-alpha-400)]">
                  {llegada}
                </div>
              </div>
              <div>
                <Input
                  label="Trabaja hasta"
                  type="time"
                  size="large"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
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
                  placeholder={puedeFichar ? "Buscar empleado..." : "Poné la hora primero"}
                  emptyMessage="Ya fichó todo el mundo"
                  disabled={!puedeFichar}
                  width="100%"
                />
              </div>
            </div>

            <div className="flex min-h-6 items-center justify-between gap-3">
              <span className="text-copy-13 text-[var(--ds-gray-900)]">
                {hasta !== "" &&
                  `Son ${duracion(new Date(), horaDespuesDe(hasta, new Date()))} de trabajo.`}
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
                  Fichar
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
            <h3 className="text-heading-16">Trabajando ahora</h3>
            {trabajando.length === 0 ? (
              <p className="text-copy-13 text-[var(--ds-gray-900)]">
                Nadie fichó todavía. Sin fichaje, el turno queda sin nadie a cargo.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--ds-gray-alpha-400)]">
                {trabajando.map((a) => (
                  <li key={a.id} className="flex flex-col gap-2 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col leading-tight">
                        <span className="text-[var(--ds-gray-1000)]">{a.nombre}</span>
                        <span className="text-copy-13 text-[var(--ds-gray-900)]">
                          {hora(a.entro)} →{" "}
                          {a.salio === null ? "sin hora de salida" : hora(a.salio)}
                        </span>
                      </div>
                      {/* La hora de arriba es la que puso al fichar, o sea un
                          plan: se puede ir antes o quedarse más. Las dos se
                          arreglan acá. */}
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={() => {
                          setEditando(editando?.id === a.id ? null : a);
                          setSalida(a.salio === null ? "" : comoHora(a.salio));
                          setError(null);
                        }}
                      >
                        {editando?.id === a.id ? "Cancelar" : "Editar"}
                      </Button>
                    </div>

                    {editando?.id === a.id && (
                      <div className="flex items-end gap-2">
                        <div className="w-36">
                          <Input
                            label="Trabaja hasta"
                            type="time"
                            size="large"
                            autoFocus
                            value={salida}
                            onChange={(e) => setSalida(e.target.value)}
                          />
                        </div>
                        <Button
                          variant="secondary"
                          size="lg"
                          disabled={salida === ""}
                          loading={guardando}
                          onClick={guardarSalida}
                        >
                          Guardar
                        </Button>
                        <span className="text-copy-13 pb-2.5 text-[var(--ds-gray-900)]">
                          {salida !== "" &&
                            `${duracion(new Date(a.entro), horaDespuesDe(salida, new Date(a.entro)))} de trabajo.`}
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
