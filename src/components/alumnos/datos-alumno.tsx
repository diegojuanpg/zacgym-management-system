"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { editarAlumno, borrarAlumno, type DatosFicha } from "@/lib/alumnos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { Select } from "@/components/ui/select";
import { PencilIcon } from "@/components/icons";
import { fechaCorta } from "@/lib/utils";

const GENERO = { femenino: "Femenino", masculino: "Masculino", otro: "Otro" } as const;

const vacio = <span className="text-[var(--ds-gray-900)]">—</span>;

/** Fuera del render: Date.now() no es puro. */
function edadDe(nacimiento: string | null) {
  if (nacimiento === null) return null;
  return Math.floor((Date.now() - new Date(nacimiento).getTime()) / (365.25 * 86400000));
}

/**
 * Los datos de la ficha, que se editan donde se leen.
 *
 * En modo lectura son filas de dato; al tocar Editar, cada fila se vuelve su
 * propio campo sin moverse de lugar. Un modal aparte obliga a acordarse de lo
 * que decía la ficha mientras se completa el formulario.
 */
export function DatosAlumno({
  alumno,
  desde,
  ultimaActividad,
}: {
  alumno: DatosFicha & { id: string };
  desde: string;
  ultimaActividad: React.ReactNode;
}) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [datos, setDatos] = React.useState<DatosFicha>(alumno);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState(false);

  const set = <C extends keyof DatosFicha>(campo: C, valor: DatosFicha[C]) =>
    setDatos((previos) => ({ ...previos, [campo]: valor }));

  const texto = (campo: keyof DatosFicha) => (datos[campo] as string | null) ?? "";

  function empezar() {
    // Al reabrir hay que volver a lo que hay en la base, no a lo tipeado antes.
    setDatos(alumno);
    setError(null);
    setConfirmando(false);
    setEditando(true);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = await editarAlumno(alumno.id, datos);
    setGuardando(false);
    if (error) return setError(error);
    setEditando(false);
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
    router.push("/alumnos");
  }

  const edad = edadDe(alumno.nacimiento);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--ds-gray-alpha-400)] px-5 py-3">
        <h2 className="text-heading-16">Datos</h2>
        {editando ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={guardar} loading={guardando}>
              Guardar
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" prefix={<PencilIcon />} onClick={empezar}>
            Editar
          </Button>
        )}
      </div>

      <dl className="flex flex-col">
        <Fila etiqueta="Nombre">
          {editando ? (
            <Input
              size="small"
              aria-label="Nombre"
              value={datos.nombre}
              onChange={(e) => set("nombre", e.target.value)}
            />
          ) : (
            alumno.nombre
          )}
        </Fila>

        <Fila etiqueta="Apellido">
          {editando ? (
            <Input
              size="small"
              aria-label="Apellido"
              value={datos.apellido}
              onChange={(e) => set("apellido", e.target.value)}
            />
          ) : (
            alumno.apellido
          )}
        </Fila>

        <Fila etiqueta="Mail">
          {editando ? (
            <Input
              size="small"
              type="email"
              aria-label="Mail"
              placeholder="alumno@gmail.com"
              value={texto("email")}
              onChange={(e) => set("email", e.target.value)}
            />
          ) : alumno.email ? (
            <a href={`mailto:${alumno.email}`} className="hover:underline">
              {alumno.email}
            </a>
          ) : (
            vacio
          )}
        </Fila>

        <Fila etiqueta="Teléfono">
          {editando ? (
            <Input
              size="small"
              inputMode="tel"
              aria-label="Teléfono"
              placeholder="11 5555 5555"
              value={texto("celular")}
              onChange={(e) => set("celular", e.target.value)}
            />
          ) : alumno.celular ? (
            <a href={`tel:${alumno.celular.replace(/\s/g, "")}`} className="hover:underline">
              {alumno.celular}
            </a>
          ) : (
            vacio
          )}
        </Fila>

        <Fila etiqueta={editando ? "Nacimiento" : "Edad"}>
          {editando ? (
            <Input
              size="small"
              type="date"
              aria-label="Nacimiento"
              value={texto("nacimiento")}
              onChange={(e) => set("nacimiento", e.target.value)}
            />
          ) : edad !== null ? (
            `${edad} años · ${fechaCorta(alumno.nacimiento!)}`
          ) : (
            vacio
          )}
        </Fila>

        <Fila etiqueta="Género">
          {editando ? (
            <Select
              size="small"
              aria-label="Género"
              value={datos.genero ?? ""}
              onChange={(e) => set("genero", (e.target.value || null) as DatosFicha["genero"])}
            >
              <option value="" disabled>
                Elegir
              </option>
              <option value="femenino">Femenino</option>
              <option value="masculino">Masculino</option>
              <option value="otro">Otro</option>
            </Select>
          ) : alumno.genero ? (
            GENERO[alumno.genero]
          ) : (
            vacio
          )}
        </Fila>

        <Fila etiqueta="Vencimiento">
          {editando ? (
            <Input
              size="small"
              type="date"
              aria-label="Vencimiento"
              value={texto("vence")}
              onChange={(e) => set("vence", e.target.value)}
            />
          ) : alumno.vence ? (
            fechaCorta(alumno.vence)
          ) : (
            vacio
          )}
        </Fila>

        <Fila etiqueta="Estado">
          {editando ? (
            <Select
              size="small"
              aria-label="Estado"
              value={datos.activo ? "si" : "no"}
              onChange={(e) => set("activo", e.target.value === "si")}
            >
              <option value="si">Activo</option>
              <option value="no">Inactivo</option>
            </Select>
          ) : alumno.activo ? (
            "Activo"
          ) : (
            "Inactivo"
          )}
        </Fila>

        {/* Los dos de abajo los pone el sistema: se miran, no se tocan. */}
        <Fila etiqueta="Alumno desde">{desde}</Fila>
        <Fila etiqueta="Última actividad">{ultimaActividad}</Fila>
      </dl>

      {(editando || error) && (
        <div className="flex flex-col gap-3 border-t border-[var(--ds-gray-alpha-400)] px-5 py-3">
          {error && (
            <Note type="error" fill>
              {error}
            </Note>
          )}

          {editando &&
            (confirmando ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-copy-13 text-[var(--ds-red-900)]">
                  Se borra la ficha y no se puede deshacer.
                </span>
                <Button variant="error" size="sm" onClick={borrar} loading={guardando}>
                  Borrar
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
                className="self-start text-[var(--ds-red-900)] hover:bg-[var(--ds-red-200)]"
              >
                Borrar ficha
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--ds-gray-alpha-300)] px-5 py-2.5 last:border-b-0">
      <dt className="text-copy-14 w-36 shrink-0 text-[var(--ds-gray-900)]">{etiqueta}</dt>
      <dd className="text-copy-14 min-w-0 flex-1 text-[var(--ds-gray-1000)]">{children}</dd>
    </div>
  );
}
