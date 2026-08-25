"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { Spinner } from "@/components/ui/spinner";
import { ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useNavegacion, useParametros } from "@/hooks/use-navegacion";

const ANCHO = 260;
// El panel se ensancha cuando trae campos: los del rango piden un renglon
// entero cada uno y el "Entre" de los montos pone dos uno al lado del otro.
const ANCHO_DOBLE = 320;

/** Comparaciones del filtro de montos. "entre" es el unico que usa dos valores. */
const OPERADORES = [
  { valor: "mayor", label: "Mayor a" },
  { valor: "menor", label: "Menor a" },
  { valor: "igual", label: "Igual a" },
  { valor: "entre", label: "Entre" },
];

/** Una fecha ISO se lee mejor como 01/08; una hora ya viene corta. */
const corto = (v: string) =>
  v.includes("-") ? v.split("-").reverse().slice(0, 2).join("/") : v;

const resumenMonto = (v: string) => {
  const [op, a, b] = v.split(":");
  const label = OPERADORES.find((o) => o.valor === op)?.label ?? "";
  return op === "entre" ? `${label} ${a} y ${b}` : `${label} ${a}`;
};

export interface OpcionOrden {
  valor: string;
  label: string;
}

/**
 * Encabezado de columna que abre un panel: primero cómo ordenar, después un
 * período opcional, y al final el filtro tipo planilla (buscador, checkboxes y
 * Aceptar/Cancelar).
 *
 * Todo vive en la URL: el filtro es el mismo parámetro repetido por opción, y
 * el orden es uno solo para toda la tabla, así no se pisan dos criterios.
 *
 * El período existe porque una columna de fechas no se puede tildar con
 * checkboxes: sobre un año son trescientas opciones y ninguna sirve sola.
 */
export function FiltroColumna({
  etiqueta,
  param,
  opciones = [],
  titulos = {},
  orden,
  periodo,
  rango,
  monto,
}: {
  etiqueta: string;
  /** Parámetro del filtro. Sin él la columna solo ordena. */
  param?: string;
  opciones?: string[];
  /** Texto a mostrar por opción cuando el valor de la URL no sirve como label. */
  titulos?: Record<string, string>;
  orden?: { param: string; opciones: OpcionOrden[] };
  /** Elección única, como el orden, pero con su propio parámetro. */
  periodo?: { param: string; predeterminado: string; opciones: OpcionOrden[] };
  /** Desde/hasta en un solo parámetro, "a..b". Cualquiera de los dos puede ir vacío. */
  rango?: { param: string; tipo: "date" | "time" };
  /** Comparación de montos, "operador:valor" ("entre:min:max"). */
  monto?: { param: string };
}) {
  const { irA: navegar, cargando } = useNavegacion();
  const searchParams = useParametros();

  const elegidas = React.useMemo(
    () => (param ? searchParams.getAll(param) : []),
    [searchParams, param],
  );
  const ordenActual = orden ? searchParams.get(orden.param) : null;
  const ordenActiva = orden?.opciones.find((o) => o.valor === ordenActual) ?? null;

  const periodoActual = periodo
    ? (searchParams.get(periodo.param) ?? periodo.predeterminado)
    : null;
  const periodoActivo = periodo?.opciones.find((o) => o.valor === periodoActual) ?? null;

  const rangoActual = rango ? (searchParams.get(rango.param) ?? "") : "";
  const montoActual = monto ? (searchParams.get(monto.param) ?? "") : "";

  const [abierto, setAbierto] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const [busqueda, setBusqueda] = React.useState("");
  // Borrador: nada se aplica hasta Aceptar, como en la planilla.
  const [borrador, setBorrador] = React.useState<string[]>(elegidas);
  const [rangoA, setRangoA] = React.useState("");
  const [rangoB, setRangoB] = React.useState("");
  const [operador, setOperador] = React.useState("mayor");
  const [montoA, setMontoA] = React.useState("");
  const [montoB, setMontoB] = React.useState("");

  // El Button del sistema no reenvía ref: el ancla del panel es el span que lo envuelve.
  const anclaRef = React.useRef<HTMLSpanElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Al cerrar, el panel se desmonta del portal y el foco cae en <body>: quien
  // navega con teclado tendría que recorrer la página entera de nuevo.
  const cerrar = React.useCallback(() => {
    setAbierto(false);
    anclaRef.current?.querySelector("button")?.focus();
  }, []);

  const ancho = rango || monto ? ANCHO_DOBLE : ANCHO;

  const ubicar = React.useCallback(() => {
    const r = anclaRef.current?.getBoundingClientRect();
    if (!r) return;
    // Portal y posición fija porque la tabla scrollea y recortaría el panel.
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
    });
  }, [ancho]);

  // El panel vive en un portal, así que hay que ignorar también los clicks en el
  // encabezado que lo abre.
  React.useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !anclaRef.current?.contains(t)) cerrar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    // Está posicionado a mano contra la ventana: si algo scrollea se despega
    // del encabezado que lo abrió. true para escuchar también a la tabla.
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [abierto, cerrar, ubicar]);

  function abrir() {
    if (abierto) return cerrar();
    ubicar();
    // Sin filtro = todo tildado, como en la planilla.
    setBorrador(elegidas.length ? elegidas : opciones);
    const [a = "", b = ""] = rangoActual.split("..");
    setRangoA(a);
    setRangoB(b);
    const [op, x = "", y = ""] = montoActual.split(":");
    setOperador(op || "mayor");
    setMontoA(x);
    setMontoB(y);
    setBusqueda("");
    setAbierto(true);
  }

  function irA(nuevos: URLSearchParams) {
    cerrar();
    navegar(nuevos);
  }

  function aplicarOrden(valor: string) {
    const nuevos = new URLSearchParams(searchParams.toString());
    // Clic sobre el orden ya activo lo saca: vuelve al orden por defecto.
    if (valor === ordenActual) nuevos.delete(orden!.param);
    else nuevos.set(orden!.param, valor);
    irA(nuevos);
  }

  function aplicarPeriodo(valor: string) {
    const nuevos = new URLSearchParams(searchParams.toString());
    // El predeterminado no se escribe: la URL limpia ya es ese período.
    if (valor === periodo!.predeterminado) nuevos.delete(periodo!.param);
    else nuevos.set(periodo!.param, valor);
    irA(nuevos);
  }

  /**
   * Saca de la URL todo lo que decide esta columna.
   *
   * "Limpiar" borraba solo el rango, asi que en Fecha —donde lo que suele estar
   * puesto es el periodo— el boton no hacia nada visible. Limpiar una columna es
   * dejarla sin filtro, sea cual sea el que tenga puesto. El orden no entra: es
   * como se ordena, no que se muestra.
   */
  function limpiarTodo() {
    const nuevos = new URLSearchParams(searchParams.toString());
    for (const clave of [param, periodo?.param, rango?.param, monto?.param]) {
      if (clave) nuevos.delete(clave);
    }
    irA(nuevos);
  }

  /** Un parámetro suelto: vacío lo saca de la URL en vez de dejarlo colgando. */
  function aplicarValor(clave: string, valor: string) {
    const nuevos = new URLSearchParams(searchParams.toString());
    if (valor === "") nuevos.delete(clave);
    else nuevos.set(clave, valor);
    irA(nuevos);
  }

  function aplicarFiltro(valores: string[]) {
    const nuevos = new URLSearchParams(searchParams.toString());
    nuevos.delete(param!);
    // Todo tildado es lo mismo que sin filtro: no ensuciamos la URL.
    if (valores.length && valores.length !== opciones.length) {
      valores.forEach((v) => nuevos.append(param!, v));
    }
    irA(nuevos);
  }

  const titulo = (o: string) => titulos[o] ?? o;
  const visibles = opciones.filter((o) =>
    titulo(o).toLowerCase().includes(busqueda.trim().toLowerCase()),
  );
  const hayFiltro = Boolean(param) && opciones.length > 0;

  const panel = pos && (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Ordenar y filtrar por ${etiqueta}`}
      style={{ top: pos.top, left: pos.left, width: ancho }}
      className="material-menu animate-in fade-in-50 zoom-in-95 fixed z-50 flex flex-col gap-2 p-2 duration-100"
    >
      {orden && (
        <div className="flex flex-col">
          {orden.opciones.map((o) => (
            <Button
              key={o.valor}
              variant="tertiary"
              size="md"
              onClick={() => aplicarOrden(o.valor)}
              className={cn(
                "justify-start",
                o.valor === ordenActual && "bg-[var(--ds-gray-alpha-200)]",
              )}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}

      {orden && periodo && <div className="-mx-2 h-px bg-[var(--ds-gray-alpha-300)]" />}

      {periodo && (
        <div className="flex flex-col">
          {periodo.opciones.map((o) => (
            <Button
              key={o.valor}
              variant="tertiary"
              size="md"
              onClick={() => aplicarPeriodo(o.valor)}
              className={cn(
                "justify-start",
                o.valor === periodoActual && "bg-[var(--ds-gray-alpha-200)]",
              )}
            >
              {o.label}
            </Button>
          ))}
        </div>
      )}

      {(orden || periodo) && (rango || monto) && (
        <div className="-mx-2 h-px bg-[var(--ds-gray-alpha-300)]" />
      )}

      {rango && (
        <div className="flex flex-col gap-2 px-1">
          {/* Uno abajo del otro y no lado a lado: partido al medio, el campo
              de fecha se comia el año y el icono del calendario. Cuanto ancho
              necesita depende del formato del navegador, asi que darle el
              renglon entero es lo unico que anda en todos. */}
          <Input
            size="sm"
            label="Desde"
            type={rango.tipo}
            value={rangoA}
            onChange={(e) => setRangoA(e.target.value)}
          />
          <Input
            size="sm"
            label="Hasta"
            type={rango.tipo}
            value={rangoB}
            min={rangoA || undefined}
            onChange={(e) => setRangoB(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={limpiarTodo}>
              Limpiar
            </Button>
            <Button
              size="sm"
              onClick={() =>
                aplicarValor(rango.param, rangoA || rangoB ? `${rangoA}..${rangoB}` : "")
              }
            >
              Aplicar
            </Button>
          </div>
        </div>
      )}

      {rango && monto && <div className="-mx-2 h-px bg-[var(--ds-gray-alpha-300)]" />}

      {monto && (
        <div className="flex flex-col gap-2 px-1">
          <Select
            size="small"
            value={operador}
            onChange={(e) => setOperador(e.target.value)}
            aria-label={`Comparar ${etiqueta}`}
          >
            {OPERADORES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.label}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <Input
                size="sm"
                type="number"
                inputMode="numeric"
                placeholder="$"
                value={montoA}
                onChange={(e) => setMontoA(e.target.value)}
                aria-label={`${etiqueta} ${operador === "entre" ? "mínimo" : "valor"}`}
              />
            </div>
            {operador === "entre" && (
              <>
                <span className="text-[var(--ds-gray-700)]">y</span>
                <div className="min-w-0 flex-1">
                  <Input
                    size="sm"
                    type="number"
                    inputMode="numeric"
                    placeholder="$"
                    value={montoB}
                    onChange={(e) => setMontoB(e.target.value)}
                    aria-label={`${etiqueta} máximo`}
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={limpiarTodo}>
              Limpiar
            </Button>
            <Button
              size="sm"
              // Sin numero no hay comparacion: el boton limpia en vez de guardar basura.
              onClick={() =>
                aplicarValor(
                  monto.param,
                  montoA === "" || (operador === "entre" && montoB === "")
                    ? ""
                    : operador === "entre"
                      ? `entre:${montoA}:${montoB}`
                      : `${operador}:${montoA}`,
                )
              }
            >
              Aplicar
            </Button>
          </div>
        </div>
      )}

      {(orden || periodo || rango || monto) && hayFiltro && (
        <div className="-mx-2 h-px bg-[var(--ds-gray-alpha-300)]" />
      )}

      {hayFiltro && (
        <>
          <SearchInput
            size="sm"
            autoFocus
            placeholder="Buscar"
            value={busqueda}
            onValueChange={setBusqueda}
          />

          <div className="flex items-center gap-3 px-1 text-xs">
            <Button
              variant="link"
              size="xs"
              onClick={() => setBorrador([...new Set([...borrador, ...visibles])])}
            >
              Seleccionar {busqueda ? "lo filtrado" : "todo"}
            </Button>
            <Button
              variant="link"
              size="xs"
              onClick={() => setBorrador(borrador.filter((v) => !visibles.includes(v)))}
            >
              Borrar
            </Button>
            <span className="ml-auto text-[var(--ds-gray-700)]">
              {borrador.length} de {opciones.length}
            </span>
          </div>

          <div className="flex max-h-56 flex-col overflow-y-auto overscroll-contain">
            {visibles.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-[var(--ds-gray-700)]">
                Sin coincidencias
              </p>
            ) : (
              visibles.map((o) => {
                const tildado = borrador.includes(o);
                return (
                  <label
                    key={o}
                    className="flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-[var(--ds-gray-1000)] transition-colors select-none hover:bg-[var(--ds-gray-alpha-100)]"
                  >
                    <Checkbox
                      checked={tildado}
                      onCheckedChange={() =>
                        setBorrador(
                          tildado ? borrador.filter((v) => v !== o) : [...borrador, o],
                        )
                      }
                    />
                    <span className="truncate">{titulo(o)}</span>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--ds-gray-alpha-400)] pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={cerrar}>
              Cancelar
            </Button>
            {/* Sin nada tildado no se bloquea: destildar todo es como se saca
                un filtro ya puesto, y con el boton apagado no habia forma. */}
            <Button type="button" size="sm" onClick={() => aplicarFiltro(borrador)}>
              Aceptar
            </Button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <span ref={anclaRef} className="-mx-1.5 inline-flex">
        <Button
          variant="tertiary"
          // sm y no xs: xs baja a text-xs y estos encabezados quedaban un punto
          // más chicos que los que no abren panel, y que el cuerpo de la tabla.
          size="sm"
          onClick={abrir}
          aria-expanded={abierto}
          aria-haspopup="dialog"
          // El panel se cierra al aplicar, asi que el aviso de que el server
          // esta trabajando tiene que quedar en el encabezado.
          suffix={cargando ? <Spinner size={12} /> : <ChevronDownIcon className="size-3" />}
          className={cn(
            // Igual que los encabezados que no abren panel, que van en bold.
            "font-bold",
            elegidas.length || ordenActiva || rangoActual || montoActual
              ? "text-[var(--ds-gray-1000)]"
              : "text-[var(--ds-gray-900)]",
          )}
        >
          <span className="flex items-center gap-1">
            {etiqueta}
            {/* El estado de la columna se ve sin abrir el panel. */}
            {elegidas.length > 0 && (
              <Badge variant="blue-subtle" size="sm">
                {elegidas.length}
              </Badge>
            )}
            {rangoActual && (
              <span className="font-normal text-[var(--ds-gray-900)]">
                · {rangoActual.split("..").map(corto).join(" → ")}
              </span>
            )}
            {montoActual && (
              <span className="font-normal text-[var(--ds-gray-900)]">
                · {resumenMonto(montoActual)}
              </span>
            )}
            {periodoActivo && periodoActual !== periodo?.predeterminado && (
              <span className="font-normal text-[var(--ds-gray-900)]">
                · {periodoActivo.label}
              </span>
            )}
            {ordenActiva && (
              <span className="font-normal text-[var(--ds-gray-900)]">
                · {ordenActiva.label}
              </span>
            )}
          </span>
        </Button>
      </span>
      {abierto && createPortal(panel, document.body)}
    </>
  );
}
