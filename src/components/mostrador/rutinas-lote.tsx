"use client";

import * as React from "react";
import { actualizarRutinas, cambiarAccesoRutina } from "@/lib/rutinas";
import { MAX_LOTE, TANDA, type Resultado, type Semana } from "@/lib/rutinas-lote";
import type { AlumnoTarea } from "@/components/mostrador/alta-tarea";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Note } from "@/components/ui/note";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { PlusIcon, XIcon } from "@/components/icons";

/**
 * Las dos acciones sobre la planilla de rutina de un alumno.
 *
 * Las dos se arman igual que una venta: elegís alumno, elegís qué hacerle,
 * Agregar, y se va juntando una lista. Recién cuando le das al botón de abajo
 * sale el pedido, con todos juntos.
 *
 * Cada renglón lleva su propia opción —una semana, o compartir/descompartir—,
 * así que en un mismo envío puede ir gente con semanas distintas. Del otro
 * lado eso son dos pedidos, uno por opción, pero acá es una sola lista.
 *
 * El alumno se elige del mismo listado que el resto del mostrador, que no trae
 * `sheet_id`: quién tiene planilla y quién no lo resuelve Apps Script, y vuelve
 * como el error de esa fila. Traerlo acá sería mandar dos mil filas más al
 * browser para tapar un botón que casi nunca hace falta tapar.
 */

/** Un renglón de la lista: a quién y qué hacerle. */
interface Renglon<M extends string> {
  id: string;
  quien: string;
  modo: M;
}

/** Lo que devuelve una server action. */
type Envio = Promise<{ resultados?: Resultado[]; error?: string }>;

/**
 * El armado de la lista, que es igual en las dos pestañas.
 *
 * `M` es lo que se elige por renglón: la semana en una, compartir o
 * descompartir en la otra.
 */
function useLista<M extends string>(alumnos: AlumnoTarea[], modoInicial: M) {
  const [renglones, setRenglones] = React.useState<Renglon<M>[]>([]);
  const [alumnoId, setAlumnoId] = React.useState("");
  const [modo, setModo] = React.useState<M>(modoInicial);

  function agregar() {
    const a = alumnos.find((x) => x.id === alumnoId);
    if (!a) return;
    setAlumnoId("");
    setRenglones((previos) => {
      const nuevo = { id: a.id, quien: a.nombre_completo, modo };
      // Al mismo alumno dos veces se le pisa la opción en vez de agregarlo de
      // nuevo: dos renglones suyos serían dos escrituras peleándose la misma
      // planilla.
      const i = previos.findIndex((r) => r.id === a.id);
      if (i === -1) return [...previos, nuevo];
      const copia = [...previos];
      copia[i] = nuevo;
      return copia;
    });
  }

  function quitar(id: string) {
    setRenglones((previos) => previos.filter((r) => r.id !== id));
  }

  /** Los ids de una opción, cortados en tandas del tamaño que aguanta el pedido. */
  function tandasDe(m: M): string[][] {
    const ids = renglones.filter((r) => r.modo === m).map((r) => r.id);
    const salida: string[][] = [];
    for (let i = 0; i < ids.length; i += TANDA) salida.push(ids.slice(i, i + TANDA));
    return salida;
  }

  return {
    renglones,
    alumnoId,
    setAlumnoId,
    modo,
    setModo,
    agregar,
    quitar,
    tandasDe,
    limpiar: () => setRenglones([]),
    lleno: renglones.length >= MAX_LOTE,
    yaEsta: renglones.some((r) => r.id === alumnoId),
  };
}

/**
 * Manda los pedidos de a uno y junta lo que va volviendo.
 *
 * Si uno se cae entero —se cortó la red, Apps Script no contestó— se frena ahí
 * y se devuelve lo que ya había: lo de los pedidos anteriores está hecho y
 * remandarlo sería escribir dos veces sobre la misma planilla.
 */
async function enTandas(
  pedidos: (() => Envio)[],
  avisar: (hechos: number) => void,
): Promise<{ resultados: Resultado[]; error?: string }> {
  const resultados: Resultado[] = [];
  for (const pedido of pedidos) {
    const r = await pedido();
    if (r.error) return { resultados, error: r.error };
    resultados.push(...(r.resultados ?? []));
    avisar(resultados.length);
  }
  return { resultados };
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
 * El formulario completo: la fila para agregar, la lista y el botón que manda.
 *
 * `opciones` son los valores del segundo desplegable y sus etiquetas. Lo que se
 * hace con la lista lo pone cada pestaña en `mandar`.
 */
function FormularioLote<M extends string>({
  alumnos,
  lista,
  etiquetaModo,
  opciones,
  aviso,
  textoBoton,
  verbo,
  nombre,
  mandar,
}: {
  alumnos: AlumnoTarea[];
  lista: ReturnType<typeof useLista<M>>;
  etiquetaModo: string;
  opciones: { valor: M; texto: string }[];
  aviso: React.ReactNode;
  textoBoton: (cuantos: number) => string;
  /** Para los avisos: "Actualizando 3 rutinas" / "3 rutinas actualizadas". */
  verbo: { gerundio: string; hecho: string };
  nombre: (cuantos: number) => string;
  mandar: (avisar: (hechos: number) => void) => Promise<{
    resultados: Resultado[];
    error?: string;
  }>;
}) {
  const [enVuelo, setEnVuelo] = React.useState(0);
  const [hechos, setHechos] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [resultados, setResultados] = React.useState<Resultado[] | null>(null);

  const etiqueta = (m: M) => opciones.find((o) => o.valor === m)?.texto ?? m;

  /**
   * Manda la lista y avisa por toast cuando termina.
   *
   * El trabajo no depende de que el modal siga abierto: las promesas viven en
   * el closure de esta función, no en el componente, así que cerrarlo no las
   * corta. Los `setState` que quedan después no hacen nada si el componente ya
   * se desmontó, y el aviso sale igual porque el Toaster está montado arriba,
   * en el layout. Lo único que sí lo corta es recargar o irse de la pantalla.
   *
   * La lista se vacía apenas sale el pedido: ya está en camino, y dejarla
   * llena invitaría a mandarla de nuevo. Es también lo que deja el formulario
   * libre para armar el próximo mientras este termina.
   */
  async function enviar() {
    const total = lista.renglones.length;
    setHechos(0);
    setError(null);
    setResultados(null);
    setEnVuelo((n) => n + total);

    const idAviso = toast.loading(`${verbo.gerundio} ${nombre(total)}...`, {
      duration: Infinity,
    });
    const promesa = mandar((n) => {
      setHechos(n);
      toast.loading(`${verbo.gerundio} ${nombre(total)}: ${n} de ${total} listos...`, {
        id: idAviso,
        duration: Infinity,
      });
    });
    lista.limpiar();

    const r = await promesa;
    setEnVuelo((n) => n - total);
    setResultados(r.resultados);
    if (r.error) setError(r.error);

    const bien = r.resultados.filter((x) => x.ok).length;
    const mal = r.resultados.filter((x) => !x.ok);
    if (r.error) {
      toast.error(`${r.error} (${bien} de ${total} alcanzaron a hacerse)`, {
        id: idAviso,
        duration: 15000,
      });
    } else if (mal.length === 0) {
      toast.success(`${nombre(bien)} ${verbo.hecho}.`, { id: idAviso, duration: 6000 });
    } else {
      toast.warning(
        `${bien} de ${total}. Quedaron afuera: ${mal.map((x) => x.quien).join(", ")}.`,
        { id: idAviso, duration: 15000 },
      );
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <div>
          <Label>Alumno</Label>
          <Combobox
            // Sin la coma, escribir "perez j" encuentra a "Perez, Juan".
            options={alumnos.map((a) => ({
              value: a.id,
              label: a.nombre_completo.replace(",", ""),
            }))}
            value={lista.alumnoId}
            onValueChange={lista.setAlumnoId}
            placeholder="Buscar alumno..."
            emptyMessage="Ningún alumno coincide"
            width="100%"
            clearable
          />
        </div>

        <div>
          <Label htmlFor={`lote-modo-${etiquetaModo}`}>{etiquetaModo}</Label>
          <Select
            id={`lote-modo-${etiquetaModo}`}
            size="large"
            value={lista.modo}
            onChange={(e) => lista.setModo(e.target.value as M)}
          >
            {opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </Select>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="lg"
          prefix={<PlusIcon />}
          disabled={!lista.alumnoId || (lista.lleno && !lista.yaEsta)}
          onClick={lista.agregar}
        >
          Agregar
        </Button>
      </div>

      {lista.renglones.length === 0 ? (
        <span className="text-copy-13 text-muted-foreground">
          Todavía no agregaste a nadie. Van hasta {MAX_LOTE} juntos.
        </span>
      ) : (
        <div className="flex flex-col gap-1 rounded-md border border-border p-2">
          {lista.renglones.map((r) => (
            <div
              key={r.id}
              className="text-copy-13 flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-[var(--ds-gray-alpha-100)]"
            >
              <span>{r.quien}</span>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{etiqueta(r.modo)}</span>
                <Button
                  type="button"
                  variant="tertiary"
                  size="icon-xs"
                  title={`Quitar a ${r.quien}`}
                  aria-label={`Quitar a ${r.quien}`}
                  onClick={() => lista.quitar(r.id)}
                  className="rounded-full"
                >
                  <XIcon />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {lista.lleno && (
        <span className="text-copy-13 text-muted-foreground">
          Llegaste a {MAX_LOTE}, que es el máximo por vez. Mandá estos y seguí con el resto.
        </span>
      )}

      <Note>{aviso}</Note>

      <div className="flex items-center justify-end border-t border-border pt-4">
        <Button
          type="button"
          size="lg"
          disabled={lista.renglones.length === 0}
          onClick={enviar}
        >
          {textoBoton(lista.renglones.length)}
        </Button>
      </div>

      {enVuelo > 0 && (
        <span className="text-copy-13 text-muted-foreground">
          {hechos} de {enVuelo} listos. Podés cerrar el modal y seguir atendiendo: te avisa
          cuando termina. Van de a {TANDA} y cada planilla tarda unos segundos.
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
 * Deja visible el bloque fechado a la semana elegida.
 *
 * Busca y muestra: los bloques ya vienen fechados en la planilla y lo único que
 * cambia es cuál queda a la vista. No se reescribe ninguna fecha.
 *
 * Por defecto la semana actual, que es el caso que se usa: alguien quedó
 * atrasado y hay que dejarle la de esta semana.
 */
export function ActualizarRutina({ alumnos }: { alumnos: AlumnoTarea[] }) {
  const lista = useLista<Semana>(alumnos, "actual");

  return (
    <FormularioLote
      alumnos={alumnos}
      lista={lista}
      etiquetaModo="Semana"
      opciones={[
        { valor: "actual", texto: "Actual" },
        { valor: "proxima", texto: "La que viene" },
      ]}
      aviso="Busca en la planilla el bloque fechado al lunes de esa semana y lo deja visible. No cambia ninguna fecha. Podés cerrar el modal: te avisa cuando termina."
      textoBoton={(n) => `Actualizar ${n || ""} ${n === 1 ? "rutina" : "rutinas"}`}
      verbo={{ gerundio: "Actualizando", hecho: "actualizadas" }}
      nombre={(n) => `${n} ${n === 1 ? "rutina" : "rutinas"}`}
      mandar={(avisar) =>
        enTandas(
          [
            ...lista.tandasDe("actual").map((ids) => () => actualizarRutinas(ids, "actual")),
            ...lista.tandasDe("proxima").map((ids) => () => actualizarRutinas(ids, "proxima")),
          ],
          avisar,
        )
      }
    />
  );
}

/**
 * Le da o le quita al alumno el acceso a su propia planilla.
 *
 * Compartir la deja siempre con las tres casillas de Drive destildadas —los
 * editores no pueden re-compartir, y ni editores ni lectores pueden descargar,
 * imprimir o copiar— y sin mandarle notificación. No son opciones de esta
 * pantalla: lo aplica Apps Script antes de dar el acceso.
 */
export function AccesoRutina({ alumnos }: { alumnos: AlumnoTarea[] }) {
  const lista = useLista<"compartir" | "descompartir">(alumnos, "compartir");

  return (
    <FormularioLote
      alumnos={alumnos}
      lista={lista}
      etiquetaModo="Qué hacer"
      opciones={[
        { valor: "compartir", texto: "Compartir" },
        { valor: "descompartir", texto: "Quitar acceso" },
      ]}
      aviso="Se comparte como editor con el mail de la ficha, sin notificarle, y sin que pueda re-compartir, descargar, imprimir ni copiar. Quitar acceso se lo saca a todos menos al dueño. Podés cerrar el modal: te avisa cuando termina."
      textoBoton={(n) => `Aplicar${n ? ` a ${n}` : ""}`}
      verbo={{ gerundio: "Cambiando", hecho: "listos" }}
      nombre={(n) => `${n} ${n === 1 ? "acceso" : "accesos"}`}
      mandar={(avisar) =>
        enTandas(
          [
            ...lista.tandasDe("compartir").map((ids) => () => cambiarAccesoRutina(ids, true)),
            ...lista
              .tandasDe("descompartir")
              .map((ids) => () => cambiarAccesoRutina(ids, false)),
          ],
          avisar,
        )
      }
    />
  );
}
