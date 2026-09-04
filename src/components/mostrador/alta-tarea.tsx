"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  crearTarea,
  crearCategoria,
  borrarCategoria,
  type Categoria,
} from "@/lib/tareas";
import { enterAvanza, enfocarPrimero } from "@/lib/foco";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Note } from "@/components/ui/note";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon, XIcon } from "@/components/icons";
import type { Empleado } from "@/lib/turnos";

export interface AlumnoTarea {
  id: string;
  nombre_completo: string;
}

/**
 * Alta de tarea: sobre quién, de qué tipo, qué hay que hacer y quién la anota.
 *
 * Los cuatro son obligatorios. "Anotó" es el empleado del mostrador y no el
 * usuario de la sesión, que es compartido y siempre es el mismo.
 *
 * Las categorías se editan acá mismo en vez de en una pantalla aparte: se tocan
 * de a una cada tanto y siempre en el momento de cargar la tarea.
 */
export function AltaTarea({
  alumnos,
  categorias,
  empleados,
  onCreada,
}: {
  alumnos: AlumnoTarea[];
  categorias: Categoria[];
  empleados: Empleado[];
  onCreada: (alumno: string) => void;
}) {
  const router = useRouter();
  const [alumnoId, setAlumnoId] = React.useState("");
  const [categoriaId, setCategoriaId] = React.useState("");
  const [anotadoPor, setAnotadoPor] = React.useState("");
  const [detalle, setDetalle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const [editando, setEditando] = React.useState(false);
  const [nuevaCategoria, setNuevaCategoria] = React.useState("");

  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    setGuardando(true);
    setError(null);
    const { error } = await crearTarea({
      alumno_id: alumnoId,
      categoria_id: categoriaId,
      detalle,
      anotado_por: anotadoPor,
    });
    setGuardando(false);
    if (error) return setError(error);

    const alumno = alumnos.find((a) => a.id === alumnoId)?.nombre_completo ?? "La tarea";
    setAlumnoId("");
    setDetalle("");
    // `anotadoPor` no se limpia: en un turno las carga siempre el mismo, y
    // volver a elegirse a uno mismo en cada tarea es puro clic al pedo.
    onCreada(alumno);
    enfocarPrimero(form);
  }

  async function agregarCategoria() {
    const { categoria, error } = await crearCategoria(nuevaCategoria);
    if (error) return setError(error);
    setNuevaCategoria("");
    setError(null);
    // Recién creada queda elegida: para eso la estabas agregando.
    if (categoria) setCategoriaId(categoria.id);
    router.refresh();
  }

  async function quitarCategoria(id: string) {
    const { error } = await borrarCategoria(id);
    if (error) return setError(error);
    if (categoriaId === id) setCategoriaId("");
    router.refresh();
  }

  return (
    <form onSubmit={guardar} onKeyDown={enterAvanza} className="flex flex-col gap-3 pb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label>Alumno</Label>
          <Combobox
            // Sin la coma, escribir "perez j" encuentra a "Perez, Juan".
            options={alumnos.map((a) => ({
              value: a.id,
              label: a.nombre_completo.replace(",", ""),
            }))}
            value={alumnoId}
            onValueChange={setAlumnoId}
            placeholder="Buscar alumno..."
            emptyMessage="Ningún alumno coincide"
            width="100%"
            clearable
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="tarea-anoto">Anotó</Label>
          <Select
            id="tarea-anoto"
            size="large"
            required
            value={anotadoPor}
            onChange={(e) => setAnotadoPor(e.target.value)}
          >
            <option value="" disabled>
              Elegir
            </option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
          {empleados.length === 0 && (
            <span className="text-copy-13 text-muted-foreground">
              No hay empleados cargados. Se agregan desde Check-in.
            </span>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="tarea-categoria">Categoría</Label>
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={() => setEditando((v) => !v)}
            >
              {editando ? "Listo" : "Editar categorías"}
            </Button>
          </div>
          <Select
            id="tarea-categoria"
            size="large"
            required
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
          >
            <option value="" disabled>
              Elegir
            </option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {editando && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex items-end gap-2">
            <Input
              label="Categoría nueva"
              size="large"
              className="flex-1"
              placeholder="Ej: Cobranza"
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              // Enter acá agregaría la categoría y mandaría el form: lo cortamos.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void agregarCategoria();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={nuevaCategoria.trim() === ""}
              onClick={agregarCategoria}
            >
              Agregar
            </Button>
          </div>

          {categorias.length === 0 ? (
            <span className="text-copy-13 text-muted-foreground">Todavía no hay categorías.</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {categorias.map((c) => (
                <span
                  key={c.id}
                  className="text-copy-13 flex items-center gap-1 rounded-full bg-[var(--ds-gray-alpha-200)] py-0.5 pr-1 pl-2.5"
                >
                  {c.nombre}
                  <Button
                    type="button"
                    variant="tertiary"
                    size="icon-xs"
                    title={`Quitar ${c.nombre}`}
                    aria-label={`Quitar ${c.nombre}`}
                    onClick={() => quitarCategoria(c.id)}
                    className="rounded-full"
                  >
                    <XIcon />
                  </Button>
                </span>
              ))}
            </div>
          )}
          <span className="text-copy-13 text-muted-foreground">
            Quitar una categoría no borra sus tareas: quedan sin categoría.
          </span>
        </div>
      )}

      {/* La tarea se lleva todo el ancho: es texto libre y lo demás son desplegables. */}
      <div>
        <Label htmlFor="tarea-detalle">Tarea</Label>
        <Textarea
          id="tarea-detalle"
          size="large"
          required
          placeholder="Qué hay que hacer"
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
        />
      </div>

      <div className="mt-1 flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          prefix={<PlusIcon />}
          disabled={!alumnoId || !categoriaId || !anotadoPor || detalle.trim() === ""}
          loading={guardando}
        >
          Crear tarea
        </Button>
      </div>

      {error && (
        <Note type="error" fill>
          {error}
        </Note>
      )}
    </form>
  );
}
