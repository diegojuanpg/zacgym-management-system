"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { abrirTurno, crearEmpleado, type Empleado } from "@/lib/turnos";
import {
  ConteoStock,
  aConteo,
  todoContado,
  type ProductoConStock,
} from "@/components/mostrador/conteo-stock";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Note } from "@/components/ui/note";
import { PlusIcon, XIcon } from "@/components/icons";
import { ahoraLocal } from "@/lib/utils";

const soloNumeros = (v: string) => v.replace(/\D/g, "");

/** Apertura de turno: quién está a cargo, con cuánta plata y con cuánto stock. */
export function TurnoModal({
  empleados,
  productos,
}: {
  empleados: Empleado[];
  productos: ProductoConStock[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  const [aCargo, setACargo] = React.useState<Empleado[]>([]);
  const [elegido, setElegido] = React.useState("");
  const [nuevo, setNuevo] = React.useState("");
  const [sumando, setSumando] = React.useState(false);
  const [cajaGrande, setCajaGrande] = React.useState("");
  const [cajaChica, setCajaChica] = React.useState("");
  const [contados, setContados] = React.useState<Map<string, string>>(new Map());
  const [arranco, setArranco] = React.useState("");
  // El tope se congela al abrir: llamar a ahoraLocal() al dibujar no es puro.
  const [tope, setTope] = React.useState("");

  function abrirModal() {
    setACargo([]);
    setElegido("");
    setNuevo("");
    setSumando(false);
    setCajaGrande("");
    setCajaChica("");
    setContados(new Map());
    setArranco(ahoraLocal());
    setTope(ahoraLocal());
    setError(null);
    setAbierto(true);
  }

  function sumar(id: string) {
    const e = empleados.find((x) => x.id === id);
    if (!e || aCargo.some((x) => x.id === id)) return;
    setACargo([...aCargo, e]);
    setElegido("");
  }

  async function agregarEmpleado() {
    const nombre = nuevo.trim();
    if (nombre === "") return;

    // Si ya existe, se suma y listo. Tirarle "ya existe" al que solo quiere
    // ponerlo a cargo es hacerle buscar el mismo nombre en el otro campo.
    const yaEsta = empleados.find((e) => e.nombre.toLowerCase() === nombre.toLowerCase());
    if (yaEsta) {
      sumar(yaEsta.id);
      setNuevo("");
      setSumando(false);
      setError(null);
      return;
    }

    const { empleado, error } = await crearEmpleado(nombre);
    if (error) return setError(error);
    setNuevo("");
    setSumando(false);
    setError(null);
    // Recién creado entra directo a la lista: para eso lo estabas cargando.
    if (empleado) setACargo((previos) => [...previos, empleado]);
    router.refresh();
  }

  const listo =
    aCargo.length > 0 &&
    arranco !== "" &&
    cajaGrande !== "" &&
    cajaChica !== "" &&
    todoContado(productos, contados);

  const faltaTexto =
    aCargo.length === 0
      ? "Elegí quién está a cargo"
      : arranco === ""
        ? "Falta la hora de arranque"
        : cajaGrande === "" || cajaChica === ""
          ? "Falta el saldo de alguna caja"
          : "Falta contar algún producto";

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = await abrirTurno({
      responsables: aCargo.map((e) => e.id),
      cajaGrande: Number(cajaGrande) || 0,
      cajaChica: Number(cajaChica) || 0,
      stock: aConteo(contados),
      abiertoEn: new Date(arranco).toISOString(),
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
          {/* Arranca lleno con la hora de ahora, que es el caso de siempre. Se
              cambia cuando alguien entro temprano y recien abre el turno al
              hacer la primera venta: esas horas tambien son de su turno. */}
          <Input
            label="Arrancó"
            type="datetime-local"
            size="large"
            value={arranco}
            max={tope}
            onChange={(e) => setArranco(e.target.value)}
            className="sm:max-w-64"
          />

          <section className="flex flex-col gap-2">
            <h3 className="text-heading-16">¿Quién estará a cargo?</h3>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>Responsable</Label>
                <Combobox
                  options={empleados
                    .filter((e) => !aCargo.some((x) => x.id === e.id))
                    .map((e) => ({ value: e.id, label: e.nombre }))}
                  value={elegido}
                  onValueChange={sumar}
                  placeholder="Buscar empleado..."
                  emptyMessage="No quedan empleados para agregar"
                  width="100%"
                />
              </div>
            </div>

            {aCargo.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aCargo.map((e) => (
                  <span
                    key={e.id}
                    className="text-copy-13 flex items-center gap-1 rounded-full bg-[var(--ds-gray-alpha-200)] py-0.5 pr-1 pl-2.5"
                  >
                    {e.nombre}
                    <Button
                      type="button"
                      variant="tertiary"
                      size="icon-xs"
                      aria-label={`Sacar a ${e.nombre}`}
                      onClick={() => setACargo(aCargo.filter((x) => x.id !== e.id))}
                      className="rounded-full"
                    >
                      <XIcon />
                    </Button>
                  </span>
                ))}
              </div>
            )}

            {/* La lista de empleados es propia, no la de usuarios: alguien que
                nunca se loguea igual puede estar a cargo del turno. Va plegado
                porque casi siempre el que abre ya está cargado; dar de alta a
                alguien es la excepción, no el camino de todos los días. */}
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
                        void agregarEmpleado();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  prefix={<PlusIcon />}
                  disabled={nuevo.trim() === ""}
                  onClick={agregarEmpleado}
                >
                  Agregar
                </Button>
                <Button
                  type="button"
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
                type="button"
                variant="link"
                size="xs"
                className="self-start"
                onClick={() => setSumando(true)}
              >
                ¿No está en la lista?
              </Button>
            )}
          </section>

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
