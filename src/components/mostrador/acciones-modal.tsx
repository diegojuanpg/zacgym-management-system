"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AltaAlumno } from "@/components/mostrador/alta-alumno";
import { AltaTarea, type AlumnoTarea } from "@/components/mostrador/alta-tarea";
import type { Categoria } from "@/lib/tareas";
import { BotonBloqueado } from "@/components/mostrador/boton-bloqueado";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Lo que no es plata: alta de alumnos y tareas. */
export function AccionesModal({
  alumnos,
  categorias,
  bloqueado = false,
  motivoBloqueo,
}: {
  alumnos: AlumnoTarea[];
  categorias: Categoria[];
  /** Sin turno abierto, o mirando un día pasado: el botón queda muerto. */
  bloqueado?: boolean;
  motivoBloqueo?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [pestania, setPestania] = React.useState("alumno");
  const [hecho, setHecho] = React.useState<string | null>(null);

  if (bloqueado) return <BotonBloqueado motivo={motivoBloqueo}>Acciones</BotonBloqueado>;

  return (
    <>
      <Button variant="secondary" onClick={() => setAbierto(true)}>
        Acciones
      </Button>

      <Modal
        open={abierto}
        onOpenChange={(v) => {
          setHecho(null);
          setAbierto(v);
        }}
        title="Acciones"
        description="Altas y tareas del mostrador."
        className="w-[min(52rem,94vw)]"
      >
        <Tabs
          value={pestania}
          onValueChange={(v) => {
            setHecho(null);
            setPestania(v);
          }}
          className="mb-4"
        >
          <TabsList>
            <TabsTrigger value="alumno">Alumno nuevo</TabsTrigger>
            <TabsTrigger value="tarea">Tarea</TabsTrigger>
          </TabsList>
        </Tabs>

        {hecho && (
          <Note type="success" fill className="mb-3">
            {hecho}
          </Note>
        )}

        {pestania === "alumno" ? (
          <AltaAlumno
            onCreado={(alumno) => {
              setHecho(`${alumno.nombre_completo} quedó cargado.`);
              // Que aparezca ya en el combo de ventas sin recargar a mano.
              router.refresh();
            }}
          />
        ) : (
          <AltaTarea
            alumnos={alumnos}
            categorias={categorias}
            onCreada={(alumno) => {
              setHecho(`Tarea cargada para ${alumno}.`);
              router.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}
