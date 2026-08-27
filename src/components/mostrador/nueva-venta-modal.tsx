"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  registrarLote,
  type ItemVenta,
  type ItemMovimiento,
  type ItemCobro,
} from "@/lib/ventas";
import { enterAvanza, enfocarPrimero } from "@/lib/foco";
import { toast } from "@/components/ui/toast";
import { BotonBloqueado } from "@/components/mostrador/boton-bloqueado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { RadioGroup, Radio } from "@/components/ui/radio";
import { Combobox } from "@/components/ui/combobox";
import { Modal } from "@/components/ui/modal";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Note } from "@/components/ui/note";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceIcon, PlusIcon } from "@/components/icons";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export interface Alumno {
  id: string;
  nombre_completo: string;
  /** Cuenta corriente: positivo debe, negativo tiene a favor. */
  saldo: number;
}
export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  stock: number | null;
}

export interface PromoDeAlumno {
  alumno_id: string;
  promo: string;
  producto_id: string;
  producto: string;
  precio: number;
}

interface FilaVenta extends ItemVenta {
  clase: "venta";
  alumno: string;
  producto: string;
  precio: number;
  /** Saldo a favor que esta línea consume. No viaja a la base: la cuenta del
   *  alumno lo netea sola, esto es solo para no mostrarlo como deuda nueva. */
  creditoAplicado: number;
}

interface FilaMovimiento extends ItemMovimiento {
  clase: "movimiento";
}

interface FilaCobro extends ItemCobro {
  clase: "cobro";
  alumno: string;
  /** Deuda que tenía al momento de cargar la fila, para mostrar si la salda toda. */
  deuda: number;
}

type Fila = FilaVenta | FilaMovimiento | FilaCobro;

type Metodo = "efectivo" | "transferencia" | "mixto" | "debe" | "no_paga";

const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

function nombreMetodo(efectivo: number, transferencia: number, noPaga = 0) {
  if (noPaga > 0) return "No paga";
  if (efectivo > 0 && transferencia > 0) return "Mixto";
  if (efectivo > 0) return "Efectivo";
  if (transferencia > 0) return "Transferencia";
  return "—";
}

/** Lo que le falta cubrir a una venta. Negativo = pagó de más. */
function faltante(f: FilaVenta) {
  return f.precio * f.cantidad - f.efectivo - f.transferencia - f.no_paga - f.creditoAplicado;
}

/**
 * Cuánto entra en cada forma según el método elegido. Un campo vacío en mixto
 * cuenta como cero; con un solo método, vacío significa todo lo que hay que cobrar.
 */
function repartir(m: Metodo, efe: string, tra: string, sugerido: number) {
  const e = Number(efe) || 0;
  const t = Number(tra) || 0;
  if (m === "debe") return { efectivo: 0, transferencia: 0, no_paga: 0 };
  // Sin cargo: cubre todo, no hay monto que escribir.
  if (m === "no_paga") return { efectivo: 0, transferencia: 0, no_paga: sugerido };
  if (m === "mixto") return { efectivo: e, transferencia: t, no_paga: 0 };
  const monto = efe === "" ? sugerido : e;
  return m === "efectivo"
    ? { efectivo: monto, transferencia: 0, no_paga: 0 }
    : { efectivo: 0, transferencia: monto, no_paga: 0 };
}

export function NuevaVentaModal({
  alumnos,
  productos,
  promos = [],
  bloqueado = false,
  motivoBloqueo,
  corrigiendo,
  control,
}: {
  alumnos: Alumno[];
  productos: Producto[];
  /** A qué promo pertenece cada alumno, para proponer su precio. */
  promos?: PromoDeAlumno[];
  /** Sin turno abierto, o mirando un día pasado: el botón queda muerto. */
  bloqueado?: boolean;
  motivoBloqueo?: string;
  /**
   * Cargando en un turno viejo: todo entra en ese turno, con la hora que se
   * elija adentro del rango en que estuvo abierto. Sin esto la carga va al turno
   * abierto y con la hora de ahora, que es el camino de todos los días.
   */
  corrigiendo?: { turnoId: string; dia: string; desde: string; hasta: string };
  /** Abierto desde afuera, cuando el disparador vive en otra pantalla. */
  control?: { abierto: boolean; cambiar: (abierto: boolean) => void };
}) {
  const router = useRouter();
  const [propio, setPropio] = React.useState(false);
  const abierto = control ? control.abierto : propio;
  const setAbierto = control ? control.cambiar : setPropio;
  const [hora, setHora] = React.useState("");
  const [filas, setFilas] = React.useState<Fila[]>([]);
  const [pestania, setPestania] = React.useState("venta");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = React.useState(false);

  // --- venta ---
  const [alumnoId, setAlumnoId] = React.useState("");
  const [productoId, setProductoId] = React.useState("");
  const [cantidad, setCantidad] = React.useState("1");
  const [metodo, setMetodo] = React.useState<Metodo>("efectivo");
  // Montos tipeados. Vacío = "todo lo que corresponda", que es el caso común.
  const [pagaEfectivo, setPagaEfectivo] = React.useState("");
  const [pagaTransferencia, setPagaTransferencia] = React.useState("");

  // --- movimiento de caja ---
  const [movTipo, setMovTipo] = React.useState<ItemMovimiento["tipo"]>("egreso");
  const [movCaja, setMovCaja] = React.useState<ItemMovimiento["caja"]>("grande");
  const [movMetodo, setMovMetodo] = React.useState<ItemMovimiento["metodo"]>("efectivo");
  const [movMonto, setMovMonto] = React.useState("");
  const [movMotivo, setMovMotivo] = React.useState("");

  // --- cuenta del alumno: cobrarle lo que debe o devolverle lo que tiene a favor ---
  const [cuentaOp, setCuentaOp] = React.useState<"cobro" | "devolucion">("cobro");
  const [devCaja, setDevCaja] = React.useState<ItemMovimiento["caja"]>("grande");
  const [cobroAlumnoId, setCobroAlumnoId] = React.useState("");
  const [cobroMetodo, setCobroMetodo] = React.useState<Metodo>("efectivo");
  const [cobroEfectivo, setCobroEfectivo] = React.useState("");
  const [cobroTransferencia, setCobroTransferencia] = React.useState("");

  const ventas = filas.filter((f): f is FilaVenta => f.clase === "venta");
  const movimientos = filas.filter((f): f is FilaMovimiento => f.clase === "movimiento");
  const cobros = filas.filter((f): f is FilaCobro => f.clase === "cobro");

  // Lo que entra o sale en cada forma, contando ventas, movimientos y cobros.
  const totalPor = (m: ItemMovimiento["metodo"]) =>
    ventas.reduce((suma, v) => suma + v[m], 0) +
    cobros.reduce((suma, c) => suma + c[m], 0) +
    movimientos
      .filter((mv) => mv.metodo === m)
      .reduce((suma, mv) => suma + (mv.tipo === "ingreso" ? mv.monto : -mv.monto), 0);

  const adeudado = ventas.reduce((suma, v) => suma + Math.max(0, faltante(v)), 0);
  const aFavor = ventas.reduce((suma, v) => suma + Math.max(0, -faltante(v)), 0);

  const productoElegido = productos.find((p) => p.id === productoId);
  // La promo del alumno elegido: define qué producto le corresponde.
  const promoDelAlumno = promos.find((p) => p.alumno_id === alumnoId) ?? null;
  const alumnoElegido = alumnos.find((a) => a.id === alumnoId);
  const unidades = Math.max(1, Number(cantidad) || 1);
  const totalLinea = productoElegido ? productoElegido.precio * unidades : null;

  // Lo que ya se cobra en este lote no se sigue mostrando como deuda pendiente.
  const cobradoEnLote = (id: string) =>
    cobros
      .filter((c) => c.alumno_id === id)
      .reduce((suma, c) => suma + c.efectivo + c.transferencia, 0);
  // Saldo a favor que las ventas del lote ya consumen.
  const creditoDeLote = (id: string) =>
    ventas.filter((v) => v.alumno_id === id).reduce((suma, v) => suma + v.creditoAplicado, 0);
  // Y lo que ya se le devuelve acá mismo: no se puede ofrecer dos veces.
  const devueltoEnLote = (id: string) =>
    movimientos.filter((m) => m.alumno_id === id).reduce((suma, m) => suma + m.monto, 0);
  /** Plata a favor que le queda, descontando lo que este lote ya usa. */
  const aFavorDe = (id: string) =>
    Math.max(
      0,
      -(alumnos.find((a) => a.id === id)?.saldo ?? 0) - creditoDeLote(id) - devueltoEnLote(id),
    );

  // La cuenta ya viene neteada: un alumno no puede deber y tener a favor a la vez.
  const debePrevio = Math.max(0, (alumnoElegido?.saldo ?? 0) - cobradoEnLote(alumnoId));
  // Descontamos lo que ya consumieron otras líneas del lote para el mismo alumno.
  const creditoUsado = creditoDeLote(alumnoId);
  const aFavorPrevio = Math.max(0, -(alumnoElegido?.saldo ?? 0) - creditoUsado);
  // Lo que tiene a favor se descuenta de lo que hay que cobrarle hoy. Lo que debe
  // de antes no se suma: es otra deuda, se cobra aparte.
  const aCobrar = totalLinea === null ? null : Math.max(0, totalLinea - aFavorPrevio);

  const cobro = (sugerido: number) =>
    repartir(metodo, pagaEfectivo, pagaTransferencia, sugerido);

  const cobroLinea = aCobrar === null ? null : cobro(aCobrar);
  const restaLinea =
    aCobrar === null || cobroLinea === null
      ? 0
      : aCobrar - cobroLinea.efectivo - cobroLinea.transferencia - cobroLinea.no_paga;

  // --- cobro de deuda: lo que debe hoy, menos lo que ya se cobra en el lote ---
  const deudores = alumnos.filter((a) => a.saldo - cobradoEnLote(a.id) > 0);
  const acreedores = alumnos.filter((a) => aFavorDe(a.id) > 0);
  const alumnoCobro = alumnos.find((a) => a.id === cobroAlumnoId);
  const deudaCobro = Math.max(0, (alumnoCobro?.saldo ?? 0) - cobradoEnLote(cobroAlumnoId));
  const aFavorCobro = aFavorDe(cobroAlumnoId);
  // Vacío = devolverle todo lo que tiene a favor, que es el caso común.
  const devuelve = cobroEfectivo === "" ? aFavorCobro : Number(cobroEfectivo) || 0;
  const quedaDebiendo = devuelve - aFavorCobro;
  const entregaCobro = repartir(cobroMetodo, cobroEfectivo, cobroTransferencia, deudaCobro);
  const restaCobro = deudaCobro - entregaCobro.efectivo - entregaCobro.transferencia;

  function agregarVenta(event: React.FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const alumno = alumnos.find((a) => a.id === alumnoId);
    const producto = productos.find((p) => p.id === productoId);
    if (!alumno || !producto) return;

    const total = producto.precio * unidades;
    const creditoAplicado = Math.min(aFavorPrevio, total);
    const { efectivo, transferencia, no_paga } = cobro(total - creditoAplicado);

    setFilas((previas) => [
      ...previas,
      {
        clase: "venta",
        alumno_id: alumno.id,
        producto_id: producto.id,
        cantidad: unidades,
        efectivo,
        transferencia,
        no_paga,
        creditoAplicado,
        alumno: alumno.nombre_completo,
        producto: producto.nombre,
        precio: producto.precio,
      },
    ]);
    // El método queda pegado: lo normal es que varios paguen igual.
    setAlumnoId("");
    setProductoId("");
    setCantidad("1");
    setPagaEfectivo("");
    setPagaTransferencia("");
    setError(null);
    // Lista la linea, el foco vuelve arriba: la siguiente venta se carga sin
    // soltar el teclado.
    enfocarPrimero(form);
  }

  function agregarMovimiento(event: React.FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const monto = Number(movMonto) || 0;
    if (monto <= 0) {
      setError("Poné cuánta plata entró o salió.");
      return;
    }
    if (movMotivo.trim() === "") {
      setError("Escribí para qué fue.");
      return;
    }

    setFilas((previas) => [
      ...previas,
      {
        clase: "movimiento",
        tipo: movTipo,
        caja: movCaja,
        metodo: movMetodo,
        monto,
        motivo: movMotivo.trim(),
      },
    ]);
    setMovMonto("");
    setMovMotivo("");
    setError(null);
    enfocarPrimero(form);
  }

  function agregarCobro(event: React.FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    if (!alumnoCobro) {
      setError("Elegí a quién le estás cobrando.");
      return;
    }
    const { efectivo, transferencia } = entregaCobro;
    if (efectivo + transferencia <= 0) {
      setError("Poné cuánta plata entregó.");
      return;
    }

    setFilas((previas) => [
      ...previas,
      {
        clase: "cobro",
        alumno_id: alumnoCobro.id,
        alumno: alumnoCobro.nombre_completo,
        efectivo,
        transferencia,
        deuda: deudaCobro,
      },
    ]);
    setCobroAlumnoId("");
    setCobroEfectivo("");
    setCobroTransferencia("");
    setError(null);
    enfocarPrimero(form);
  }

  /**
   * Devolverle plata: sale del cajón como egreso y le baja el saldo a favor.
   *
   * Es un movimiento de caja, no una fila aparte: la plata que sale del cajón
   * es un egreso y nada más. El descuento en la cuenta lo hace la base, atado a
   * ese egreso, así que borrarlo devuelve el saldo a favor.
   */
  function agregarDevolucion(event: React.FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    if (!alumnoCobro) {
      setError("Elegí a quién le estás devolviendo.");
      return;
    }
    if (devuelve <= 0) {
      setError("Poné cuánta plata le devolvés.");
      return;
    }

    setFilas((previas) => [
      ...previas,
      {
        clase: "movimiento",
        tipo: "egreso",
        monto: devuelve,
        motivo: `Devolución a ${alumnoCobro.nombre_completo}`,
        caja: devCaja,
        metodo: cobroMetodo === "transferencia" ? "transferencia" : "efectivo",
        alumno_id: alumnoCobro.id,
      },
    ]);
    setCobroAlumnoId("");
    setCobroEfectivo("");
    setError(null);
    enfocarPrimero(form);
  }

  // Cobrar y devolver no comparten ni los alumnos ni los métodos: al cambiar de
  // sentido se limpia todo para no cargar una cosa con los datos de la otra.
  function cambiarOperacion(op: string) {
    setCuentaOp(op as "cobro" | "devolucion");
    setCobroAlumnoId("");
    setCobroMetodo("efectivo");
    setCobroEfectivo("");
    setCobroTransferencia("");
    setError(null);
  }

  async function confirmar() {
    if (corrigiendo && hora === "") {
      setError("Poné a qué hora fue, adentro del turno.");
      return;
    }
    setGuardando(true);
    setError(null);
    const { error } = await registrarLote(
      ventas.map(({ alumno_id, producto_id, cantidad, efectivo, transferencia, no_paga }) => ({
        alumno_id,
        producto_id,
        cantidad,
        efectivo,
        transferencia,
        no_paga,
      })),
      movimientos.map(({ tipo, monto, motivo, caja, metodo, alumno_id }) => ({
        tipo,
        monto,
        motivo,
        caja,
        metodo,
        alumno_id,
      })),
      cobros.map(({ alumno_id, efectivo, transferencia }) => ({
        alumno_id,
        efectivo,
        transferencia,
      })),
      corrigiendo ? { turnoId: corrigiendo.turnoId, creadoEn: `${corrigiendo.dia}T${hora}:00-03:00` } : undefined,
    );
    setGuardando(false);
    if (error) {
      setError(error);
      return;
    }
    const cuantas = ventas.length + movimientos.length + cobros.length;
    toast.success(
      cuantas === 1 ? "Se cargó 1 línea" : `Se cargaron ${cuantas} líneas`,
    );
    setFilas([]);
    setAbierto(false);
    router.refresh();
  }

  function cambiarApertura(abrir: boolean) {
    // Cerrar con la lista cargada sería perder ventas: preguntamos antes.
    if (!abrir && filas.length > 0) {
      setConfirmarDescarte(true);
      return;
    }
    if (!abrir) setError(null);
    setAbierto(abrir);
  }

  function descartar() {
    setFilas([]);
    setError(null);
    setConfirmarDescarte(false);
    setAbierto(false);
  }

  if (bloqueado)
    return <BotonBloqueado motivo={motivoBloqueo}>Agregar movimientos</BotonBloqueado>;

  return (
    <>
      {!control && (
        <Button onClick={() => setAbierto(true)} prefix={<PlusIcon />}>
          Agregar movimientos
        </Button>
      )}

      <Modal
        open={abierto}
        onOpenChange={cambiarApertura}
        title="Cargar movimientos"
        description="Apilá todo lo del turno y confirmá una sola vez."
        className="w-[min(60rem,94vw)]"
        sticky
        footer={
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-copy-14 text-muted-foreground">
              <span>
                {filas.length} {filas.length === 1 ? "línea" : "líneas"}
              </span>
              <span>
                Efectivo{" "}
                <strong className="text-foreground tabular-nums">
                  {pesos(totalPor("efectivo"))}
                </strong>
              </span>
              <span>
                Transferencia{" "}
                <strong className="text-foreground tabular-nums">
                  {pesos(totalPor("transferencia"))}
                </strong>
              </span>
              {/* La deuda no es plata que entró: solo aparece si hay. */}
              {adeudado > 0 && (
                <span>
                  Debe <strong className="text-foreground tabular-nums">{pesos(adeudado)}</strong>
                </span>
              )}
              {aFavor > 0 && (
                <span>
                  A favor{" "}
                  <strong className="text-foreground tabular-nums">{pesos(aFavor)}</strong>
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => cambiarApertura(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={filas.length === 0} loading={guardando}>
                Confirmar y cargar
              </Button>
            </div>
          </div>
        }
      >
        {corrigiendo && (
          /* Una hora para todo el lote: se esta reconstruyendo un momento del
             turno, no cargando cosas sueltas de horas distintas. */
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--ds-amber-400)] bg-[var(--ds-amber-100)] p-3">
            <div className="w-40">
              <Input
                label="¿A qué hora fue?"
                type="time"
                size="large"
                min={corrigiendo.desde}
                max={corrigiendo.hasta}
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
            <p className="text-copy-13 text-[var(--ds-amber-900)]">
              Entra en el turno de {corrigiendo.desde} a {corrigiendo.hasta}, no en el de ahora.
            </p>
          </div>
        )}

        <Tabs value={pestania} onValueChange={setPestania} className="mb-4">
          <TabsList>
            <TabsTrigger value="venta">Venta</TabsTrigger>
            <TabsTrigger value="cobro">Cuenta</TabsTrigger>
            <TabsTrigger value="caja">Movimiento de caja</TabsTrigger>
          </TabsList>
        </Tabs>

        {pestania === "venta" ? (
          <form onSubmit={agregarVenta} onKeyDown={enterAvanza} className="flex flex-col gap-1 pb-4">
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_5rem_9rem_minmax(7rem,auto)]">
              <div>
                <Label>Alumno</Label>
                <Combobox
                  // Sin la coma, escribir "perez j" encuentra a "Perez, Juan": el
                  // combobox busca por substring y la coma cortaba la coincidencia.
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
                <Label>Producto</Label>
                <Combobox
                  options={productos.map((p) => ({ value: p.id, label: p.nombre }))}
                  value={productoId}
                  onValueChange={setProductoId}
                  placeholder="Buscar producto..."
                  emptyMessage="Ningún producto coincide"
                  width="100%"
                  clearable
                />
              </div>

              <Input
                label="Cant."
                size="large"
                inputMode="numeric"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
              />

              <div>
                <Label htmlFor="metodo">Método</Label>
                <Select
                  id="metodo"
                  size="large"
                  value={metodo}
                  onChange={(e) => {
                    setMetodo(e.target.value as Metodo);
                    setPagaEfectivo("");
                    setPagaTransferencia("");
                  }}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="mixto">Mixto</option>
                  <option value="debe">Debe</option>
                  {/* Lo que saca el dueño: sale del stock y no se cobra. */}
                  <option value="no_paga">No paga</option>
                </Select>
              </div>

              {/* Resultado, no campo: sin caja, alineado a la base de los inputs. */}
              <div className="flex flex-col items-end">
                <Label>Total</Label>
                <span className="flex h-10 items-center text-heading-20 tabular-nums">
                  {totalLinea === null ? "—" : pesos(totalLinea)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-end gap-3">
                {metodo === "mixto" ? (
                  <>
                    <div className="w-40">
                      <Input
                        label="Efectivo"
                        size="large"
                        inputMode="numeric"
                        prefix="$"
                        placeholder="0"
                        value={pagaEfectivo}
                        onChange={(e) => setPagaEfectivo(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                    <div className="w-40">
                      <Input
                        label="Transfer."
                        size="large"
                        inputMode="numeric"
                        prefix="$"
                        placeholder="0"
                        value={pagaTransferencia}
                        onChange={(e) => setPagaTransferencia(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  </>
                ) : metodo === "debe" || metodo === "no_paga" ? null : (
                  <div className="w-40">
                    <Input
                      label="Paga"
                      size="large"
                      inputMode="numeric"
                      prefix="$"
                      placeholder={aCobrar === null ? "0" : String(aCobrar)}
                      value={pagaEfectivo}
                      onChange={(e) => setPagaEfectivo(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                )}
              </div>

              <Button type="submit" variant="secondary" size="lg" prefix={<PlusIcon />}>
                Añadir
              </Button>
            </div>

            {/* La promo se avisa y se propone; nunca cambia el producto sola.
                Aplicarla en silencio hace que el precio salga distinto al del
                catálogo sin que nadie entienda por qué. */}
            {promoDelAlumno && productoId !== promoDelAlumno.producto_id && (
              <div className="text-copy-13 mt-1 flex flex-wrap items-center gap-2 rounded-md bg-[var(--ds-blue-100)] px-3 py-2 text-[var(--ds-blue-900)]">
                <span>
                  Está en <strong>{promoDelAlumno.promo}</strong>: le corresponde{" "}
                  {promoDelAlumno.producto} a {pesos(promoDelAlumno.precio)}.
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => setProductoId(promoDelAlumno.producto_id)}
                >
                  Usar la promo
                </Button>
              </div>
            )}

            {/* Alto reservado siempre: que aparezca el aviso no debe mover la fila. */}
            <div className="flex min-h-5 items-center justify-between gap-4 text-copy-13">
              <span>
                {debePrevio > 0 && (
                  <span className="text-[var(--ds-amber-900)]">
                    Debe {pesos(debePrevio)} de antes
                  </span>
                )}
                {aFavorPrevio > 0 && (
                  <span className="text-[var(--ds-blue-900)]">
                    Tiene {pesos(aFavorPrevio)} a favor
                    {aCobrar !== null && ` · se le cobra ${pesos(aCobrar)}`}
                  </span>
                )}
              </span>
              <span>
                {restaLinea > 0 && (
                  <span className="text-[var(--ds-amber-900)]">
                    Queda debiendo {pesos(restaLinea)}
                  </span>
                )}
                {restaLinea < 0 && (
                  <span className="text-[var(--ds-blue-900)]">
                    Le quedan {pesos(-restaLinea)} a favor
                  </span>
                )}
              </span>
            </div>
          </form>
        ) : pestania === "cobro" ? (
          <form
            onSubmit={cuentaOp === "cobro" ? agregarCobro : agregarDevolucion}
            onKeyDown={enterAvanza}
            className="flex flex-col gap-1 pb-4"
          >
            {/* El sentido de la plata se elige, no se deduce del alumno: cobrar y
                devolver mueven el cajón para lados opuestos. */}
            <RadioGroup
              value={cuentaOp}
              onValueChange={cambiarOperacion}
              className="mb-4 flex-row gap-6"
            >
              <Radio value="cobro">Cobrar deuda</Radio>
              <Radio value="devolucion">Devolver plata</Radio>
            </RadioGroup>

            <div
              className={`grid grid-cols-2 items-end gap-3 ${
                cuentaOp === "cobro"
                  ? "sm:grid-cols-[1fr_9rem_minmax(7rem,auto)]"
                  : "sm:grid-cols-[1fr_9rem_7rem_minmax(7rem,auto)]"
              }`}
            >
              <div>
                <Label>Alumno</Label>
                <Combobox
                  // Cobrarle a alguien sin deuda no es un cobro, y devolverle a
                  // alguien sin plata a favor es prestarle: cada lado lista lo suyo.
                  options={(cuentaOp === "cobro" ? deudores : acreedores).map((a) => ({
                    value: a.id,
                    label:
                      cuentaOp === "cobro"
                        ? `${a.nombre_completo.replace(",", "")} — debe ${pesos(a.saldo)}`
                        : `${a.nombre_completo.replace(",", "")} — a favor ${pesos(aFavorDe(a.id))}`,
                  }))}
                  value={cobroAlumnoId}
                  onValueChange={setCobroAlumnoId}
                  placeholder="Buscar alumno..."
                  emptyMessage={
                    cuentaOp === "cobro" ? "Nadie debe plata" : "Nadie tiene plata a favor"
                  }
                  width="100%"
                  clearable
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="cobro-metodo">Método</Label>
                <Select
                  id="cobro-metodo"
                  size="large"
                  value={cobroMetodo}
                  onChange={(e) => {
                    setCobroMetodo(e.target.value as Metodo);
                    setCobroEfectivo("");
                    setCobroTransferencia("");
                  }}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  {/* Devolver es una sola entrega: partirla en dos es cargar dos. */}
                  {cuentaOp === "cobro" && <option value="mixto">Mixto</option>}
                </Select>
              </div>

              {cuentaOp === "devolucion" && (
                <div>
                  <Label htmlFor="dev-caja">Caja</Label>
                  <Select
                    id="dev-caja"
                    size="large"
                    value={devCaja}
                    onChange={(e) => setDevCaja(e.target.value as ItemMovimiento["caja"])}
                  >
                    <option value="grande">Grande</option>
                    <option value="chica">Chica</option>
                  </Select>
                </div>
              )}

              <div className="flex flex-col items-end">
                <Label>{cuentaOp === "cobro" ? "Debe" : "A favor"}</Label>
                <span className="flex h-10 items-center text-heading-20 tabular-nums">
                  {cobroAlumnoId === ""
                    ? "—"
                    : pesos(cuentaOp === "cobro" ? deudaCobro : aFavorCobro)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-end gap-3">
                {cuentaOp === "cobro" && cobroMetodo === "mixto" ? (
                  <>
                    <div className="w-40">
                      <Input
                        label="Efectivo"
                        size="large"
                        inputMode="numeric"
                        prefix="$"
                        placeholder="0"
                        value={cobroEfectivo}
                        onChange={(e) => setCobroEfectivo(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                    <div className="w-40">
                      <Input
                        label="Transfer."
                        size="large"
                        inputMode="numeric"
                        prefix="$"
                        placeholder="0"
                        value={cobroTransferencia}
                        onChange={(e) => setCobroTransferencia(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  </>
                ) : (
                  <div className="w-40">
                    <Input
                      label={cuentaOp === "cobro" ? "Paga" : "Devuelve"}
                      size="large"
                      inputMode="numeric"
                      prefix="$"
                      placeholder={String(cuentaOp === "cobro" ? deudaCobro : aFavorCobro)}
                      value={cobroEfectivo}
                      onChange={(e) => setCobroEfectivo(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                )}
              </div>

              <Button type="submit" variant="secondary" size="lg" prefix={<PlusIcon />}>
                Añadir
              </Button>
            </div>

            <div className="flex min-h-5 items-center justify-between gap-4 text-copy-13">
              <span className="text-muted-foreground">
                {cobroAlumnoId !== "" &&
                  (cuentaOp === "cobro"
                    ? "Se descuenta de las compras impagas más viejas primero."
                    : "Sale del cajón y se descuenta de lo que pagó de más, de lo más viejo primero.")}
              </span>
              <span>
                {cuentaOp === "cobro" ? (
                  <>
                    {restaCobro > 0 && cobroAlumnoId !== "" && (
                      <span className="text-[var(--ds-amber-900)]">
                        Le siguen quedando {pesos(restaCobro)}
                      </span>
                    )}
                    {restaCobro < 0 && (
                      <span className="text-[var(--ds-blue-900)]">
                        Le quedan {pesos(-restaCobro)} a favor
                      </span>
                    )}
                  </>
                ) : (
                  quedaDebiendo > 0 &&
                  cobroAlumnoId !== "" && (
                    <span className="text-[var(--ds-amber-900)]">
                      Le queda debiendo {pesos(quedaDebiendo)}
                    </span>
                  )
                )}
              </span>
            </div>
          </form>
        ) : (
          <form onSubmit={agregarMovimiento} onKeyDown={enterAvanza} className="flex flex-col gap-1 pb-4">
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[10rem_8rem_10rem_1fr]">
              <div>
                <Label htmlFor="mov-tipo">Movimiento</Label>
                <Select
                  id="mov-tipo"
                  size="large"
                  autoFocus
                  value={movTipo}
                  onChange={(e) => setMovTipo(e.target.value as ItemMovimiento["tipo"])}
                >
                  <option value="egreso">Sale plata</option>
                  <option value="ingreso">Entra plata</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="mov-caja">Caja</Label>
                <Select
                  id="mov-caja"
                  size="large"
                  value={movCaja}
                  onChange={(e) => setMovCaja(e.target.value as ItemMovimiento["caja"])}
                >
                  <option value="grande">Grande</option>
                  <option value="chica">Chica</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="mov-metodo">Método</Label>
                <Select
                  id="mov-metodo"
                  size="large"
                  value={movMetodo}
                  onChange={(e) => setMovMetodo(e.target.value as ItemMovimiento["metodo"])}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </Select>
              </div>

              <Input
                label="Para qué"
                size="large"
                placeholder="Comida del turno, reponer caja chica, proveedor..."
                value={movMotivo}
                onChange={(e) => setMovMotivo(e.target.value)}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
              <div className="w-40">
                <Input
                  label="Monto"
                  size="large"
                  inputMode="numeric"
                  prefix="$"
                  placeholder="0"
                  value={movMonto}
                  onChange={(e) => setMovMonto(e.target.value.replace(/\D/g, ""))}
                />
              </div>

              <Button type="submit" variant="secondary" size="lg" prefix={<PlusIcon />}>
                Añadir
              </Button>
            </div>

            <div className="min-h-5" />
          </form>
        )}

        {/* Alto fijo: el modal no salta al apilar líneas ni al aparecer un error;
            lo que se achica es la lista, no la ventana. */}
        <div className="flex h-72 flex-col gap-3">
          {error && (
            <Note type="error" fill>
              {error}
            </Note>
          )}

          {filas.length === 0 ? (
            <EmptyState
              icon={<InvoiceIcon />}
              title="La lista está vacía"
              description="Añadí las ventas y los movimientos de a uno y confirmá todo junto al final."
              className="min-h-0 flex-1"
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
              <TableRoot>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Alumno</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead numeric>Total</TableHead>
                      <TableHead className="text-center" />
                    </TableRow>
                  </TableHeader>
                  <TableBody striped>
                    {filas.map((f, i) => (
                      <TableRow key={i}>
                        {f.clase === "venta" ? (
                          <>
                            <TableCell>{f.alumno}</TableCell>
                            <TableCell>{f.producto}</TableCell>
                            <TableCell>{f.cantidad}</TableCell>
                            <TableCell>
                              {nombreMetodo(f.efectivo, f.transferencia, f.no_paga)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {pesos(f.efectivo + f.transferencia)}
                                {f.creditoAplicado > 0 && (
                                  <Badge variant="blue-subtle">
                                    Usó {pesos(f.creditoAplicado)} a favor
                                  </Badge>
                                )}
                                {faltante(f) > 0 && (
                                  <Badge variant="amber-subtle">Debe {pesos(faltante(f))}</Badge>
                                )}
                                {faltante(f) < 0 && (
                                  <Badge variant="blue-subtle">
                                    A favor {pesos(-faltante(f))}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell numeric>{pesos(f.precio * f.cantidad)}</TableCell>
                          </>
                        ) : f.clase === "cobro" ? (
                          <>
                            <TableCell>{f.alumno}</TableCell>
                            <TableCell>Cobro de deuda</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>{nombreMetodo(f.efectivo, f.transferencia)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {pesos(f.efectivo + f.transferencia)}
                                {f.deuda - f.efectivo - f.transferencia > 0 && (
                                  <Badge variant="amber-subtle">
                                    Debe {pesos(f.deuda - f.efectivo - f.transferencia)}
                                  </Badge>
                                )}
                                {f.deuda - f.efectivo - f.transferencia < 0 && (
                                  <Badge variant="blue-subtle">
                                    A favor {pesos(f.efectivo + f.transferencia - f.deuda)}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell numeric>—</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-muted-foreground capitalize">
                              Caja {f.caja}
                            </TableCell>
                            <TableCell>{f.motivo}</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell className="capitalize">{f.metodo}</TableCell>
                            <TableCell>
                              <span
                                className={
                                  f.tipo === "ingreso"
                                    ? "text-[var(--ds-green-900)]"
                                    : "text-[var(--ds-amber-900)]"
                                }
                              >
                                {f.tipo === "ingreso" ? "+" : "−"}
                                {pesos(f.monto)}
                              </span>
                            </TableCell>
                            <TableCell numeric>—</TableCell>
                          </>
                        )}
                        <TableCell className="text-center">
                          <Button
                            variant="tertiary"
                            size="sm"
                            className="hover:bg-[var(--ds-red-200)] hover:text-[var(--ds-red-900)]"
                            onClick={() => setFilas((previas) => previas.filter((_, j) => j !== i))}
                          >
                            Quitar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableRoot>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={confirmarDescarte}
        onOpenChange={setConfirmarDescarte}
        title="Descartar lo cargado"
        description={`Tenés ${filas.length} ${filas.length === 1 ? "línea" : "líneas"} sin confirmar. Si salís ahora se pierden.`}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmarDescarte(false)}>
              Seguir cargando
            </Button>
            <Button variant="error" onClick={descartar}>
              Descartar
            </Button>
          </div>
        }
      />
    </>
  );
}
