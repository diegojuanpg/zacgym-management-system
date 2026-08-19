"use client";

import * as React from "react";
import { crearAlumno, type DatosAlumno } from "@/lib/alumnos";
import { enterAvanza, enfocarPrimero } from "@/lib/foco";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Note } from "@/components/ui/note";
import { PlusIcon } from "@/components/icons";

const VACIA: DatosAlumno = {
  apellido: "",
  nombre: "",
  nacimiento: null,
  genero: null,
  celular: null,
  email: null,
};

/**
 * Alta de alumno desde el mostrador. Se guarda al toque en vez de apilarse en el
 * lote: recién creado tiene que poder elegirse en la venta que estás cargando.
 */
export function AltaAlumno({
  onCreado,
}: {
  onCreado: (alumno: { id: string; nombre_completo: string }) => void;
}) {
  const [datos, setDatos] = React.useState<DatosAlumno>(VACIA);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const set = <C extends keyof DatosAlumno>(campo: C, valor: DatosAlumno[C]) =>
    setDatos((previos) => ({ ...previos, [campo]: valor }));

  const texto = (campo: keyof DatosAlumno) => (datos[campo] as string | null) ?? "";

  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    setGuardando(true);
    setError(null);
    const { alumno, error } = await crearAlumno(datos);
    setGuardando(false);
    if (error || !alumno) {
      setError(error ?? "No se pudo crear el alumno.");
      return;
    }
    setDatos(VACIA);
    onCreado(alumno);
    enfocarPrimero(form);
  }

  return (
    <form onSubmit={guardar} onKeyDown={enterAvanza} className="flex flex-col gap-3 pb-4">
      {/* Arriba lo obligatorio, abajo lo que se puede completar después. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Input
          label="Nombre"
          size="large"
          required
          autoFocus
          value={datos.nombre}
          onChange={(e) => set("nombre", e.target.value)}
        />
        <Input
          label="Apellido"
          size="large"
          required
          value={datos.apellido}
          onChange={(e) => set("apellido", e.target.value)}
        />
        <div>
          <Label htmlFor="alta-genero">Género</Label>
          <Select
            id="alta-genero"
            size="large"
            required
            value={datos.genero ?? ""}
            onChange={(e) => set("genero", (e.target.value || null) as DatosAlumno["genero"])}
          >
            <option value="" disabled>
              Elegir
            </option>
            <option value="femenino">Femenino</option>
            <option value="masculino">Masculino</option>
            <option value="otro">Otro</option>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Input
          label="Nacimiento (Opcional)"
          size="large"
          type="date"
          value={texto("nacimiento")}
          onChange={(e) => set("nacimiento", e.target.value)}
        />
        <Input
          label="Celular (Opcional)"
          size="large"
          inputMode="tel"
          placeholder="11 5555 5555"
          value={texto("celular")}
          onChange={(e) => set("celular", e.target.value)}
        />
        <Input
          label="Mail (Opcional)"
          size="large"
          type="email"
          placeholder="alumno@gmail.com"
          value={texto("email")}
          onChange={(e) => set("email", e.target.value)}
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-copy-13 text-muted-foreground">
          Nacimiento, celular y mail se pueden completar después.
        </span>
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          prefix={<PlusIcon />}
          loading={guardando}
        >
          Crear alumno
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
