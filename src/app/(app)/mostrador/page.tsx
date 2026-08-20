import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inicioDelDia, hoyEnBsAs, rangoDelDia } from "@/lib/utils";
import { borrarVenta, borrarMovimiento, borrarPago } from "@/lib/ventas";
import { NuevaVentaModal } from "@/components/mostrador/nueva-venta-modal";
import { AccionesModal } from "@/components/mostrador/acciones-modal";
import { TurnoModal } from "@/components/mostrador/turno-modal";
import { CerrarTurnoModal } from "@/components/mostrador/cerrar-turno-modal";
import { AsistenciaModal } from "@/components/mostrador/asistencia-modal";
import type { Asistencia } from "@/lib/asistencias";
import { CajaCard, type EstadoCaja } from "@/components/mostrador/caja-card";
import { efectivoDelDia, saltosEntreTurnos } from "@/lib/caja";
import { SelectorDia } from "@/components/mostrador/selector-dia";
import {
  TurnoSeparador,
  type TurnoDelDia,
  type DiferenciaProducto,
} from "@/components/mostrador/turno-separador";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FiltroColumna } from "@/components/filtro-columna";
import { EmptyState } from "@/components/ui/empty-state";
import { CartIcon } from "@/components/icons";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const ZONA = "America/Argentina/Buenos_Aires";
const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

function nombreMetodo(efectivo: number, transferencia: number, noPaga = 0) {
  // Sin cargo: lo que se lleva el dueño. No entra plata y no queda deuda.
  if (noPaga > 0) return "No paga";
  if (efectivo > 0 && transferencia > 0) return "Mixto";
  if (efectivo > 0) return "Efectivo";
  if (transferencia > 0) return "Transferencia";
  return "—";
}

interface MovimientoFila {
  id: string;
  tipo: "ingreso" | "egreso";
  caja: "grande" | "chica";
  metodo: "efectivo" | "transferencia";
  monto: number;
  motivo: string;
  delta: number;
  turno_id: string;
  creado_en: string;
  anulado_en: string | null;
}

interface VentaFila {
  id: string;
  alumno: string;
  producto: string;
  cantidad: number;
  total: number;
  efectivo: number;
  transferencia: number;
  no_paga: number;
  saldo: number;
  turno_id: string;
  creado_en: string;
  anulada_en: string | null;
}

interface PagoFila {
  id: string;
  venta_id: string;
  alumno: string;
  producto: string;
  monto: number;
  metodo: "efectivo" | "transferencia" | "no_paga";
  caja: "grande" | "chica";
  turno_id: string;
  creado_en: string;
  anulada_en: string | null;
}

interface TurnoAbierto {
  id: string;
  abierto_en: string;
  caja_grande_inicial: number;
  caja_chica_inicial: number;
  ventas_grande: number;
  ventas_chica: number;
  movimientos_grande: number;
  movimientos_chica: number;
  caja_grande_esperada: number;
  caja_chica_esperada: number;
  responsables: string[];
}

/** Un cobro puede tocar varias compras impagas: se muestran como una sola fila. */
interface CobroFila {
  ids: string[];
  alumno: string;
  efectivo: number;
  transferencia: number;
  turno_id: string;
  creado_en: string;
}

export default async function MostradorPage({ searchParams }: PageProps<"/mostrador">) {
  await requireStaff();
  const { fecha, orden, alumno, detalle, metodo } = await searchParams;
  // El mostrador arranca en hoy y se puede mover a cualquier día que tenga algo
  // cargado. Un turno cerrado deja de vaciar la pantalla: sus movimientos siguen
  // en el día que pasaron, que es lo que el del turno siguiente necesita ver.
  const hoyDia = hoyEnBsAs();
  const dia = typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyDia;
  const esHoy = dia === hoyDia;
  const { desde, hasta } = rangoDelDia(dia);
  // Un filtro se manda como el mismo parametro repetido: ?alumno=X&alumno=Y.
  const lista = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  const supabase = await createClient();

  // El turno abierto y los catalogos no dependen entre si: van en la misma vuelta.
  const [
    { data: turno },
    { data: alumnos },
    { data: productos },
    { data: empleados },
    { data: asistencias },
    { data: promos },
    { data: categorias },
    { data: dias },
  ] = await Promise.all([
      supabase
        .from("turno_actual")
        .select(
          "id, abierto_en, caja_grande_inicial, caja_chica_inicial, ventas_grande, ventas_chica, movimientos_grande, movimientos_chica, caja_grande_esperada, caja_chica_esperada, responsables",
        )
        .maybeSingle<TurnoAbierto>(),
      supabase
        .from("alumnos_cuenta")
        .select("id, nombre_completo, saldo")
        // Sin filtrar por activo: el que dejó de venir hace un año y vuelve a
        // pagar la cuota tiene que poder encontrarse para cobrarle.
        .limit(5000)
        .order("nombre_completo")
        .overrideTypes<{ id: string; nombre_completo: string; saldo: number }[]>(),
      supabase
        .from("productos")
        .select("id, nombre, precio, stock, contar_en_turno")
        .eq("activo", true)
        .order("nombre"),
      supabase.from("empleados").select("id, nombre").eq("activo", true).order("nombre"),
      // Las jornadas de hoy, no solo las abiertas: el que entró a las 7 y se
      // fue a las 15 tiene que seguir viéndose hasta que cierre el día.
      //
      // Y el que sigue adentro aparece aunque haya entrado ayer: el turno noche
      // ficha a las 22 y sale a las 2, y a las 00:01 no puede desaparecer de la
      // lista mientras está atendiendo.
      supabase
        .from("asistencias_detalle")
        .select("id, empleado_id, nombre, entro, salio, trabajando")
        .or(`entro.gte.${inicioDelDia()},trabajando.is.true`)
        .order("entro")
        .overrideTypes<Asistencia[]>(),
      supabase.from("alumno_promo").select("alumno_id, promo, producto_id, producto, precio"),
      supabase.from("tarea_categorias").select("id, nombre").order("nombre"),
      // Los dias que tienen algo cargado: son los unicos elegibles en el calendario.
      supabase.from("dias_con_ventas").select("dia").order("dia"),
    ]);

  // Todo lo del dia elegido, sin importar en que turno cayo: despues se agrupa.
  const porDia = <T,>(tabla: string, columnas: string) =>
    supabase
      .from(tabla)
      .select(columnas)
      .gte("creado_en", desde)
      .lt("creado_en", hasta)
      .order("creado_en", { ascending: false })
      .overrideTypes<T[]>();

  const [{ data: ventas }, { data: pagos }, { data: movimientos }] = await Promise.all([
    porDia<VentaFila>(
      "ventas_saldo",
      "id, alumno, producto, cantidad, total, efectivo, transferencia, no_paga, saldo, turno_id, creado_en, anulada_en",
    ),
    porDia<PagoFila>(
      "pagos_detalle",
      "id, venta_id, alumno, producto, monto, metodo, caja, turno_id, creado_en, anulada_en",
    ),
    porDia<MovimientoFila>(
      "movimientos_caja_detalle",
      "id, tipo, caja, metodo, monto, motivo, delta, turno_id, creado_en, anulado_en",
    ),
  ]);

  // Los turnos que tocaron el dia: los que dejaron movimientos, mas el abierto
  // si estamos parados en hoy (puede no haber vendido nada todavia).
  const idsTurno = [
    ...new Set([
      ...(ventas ?? []).map((v) => v.turno_id),
      ...(pagos ?? []).map((p) => p.turno_id),
      ...(movimientos ?? []).map((m) => m.turno_id),
    ]),
  ].filter(Boolean);

  const [{ data: cerrados }, { data: difStock }] = await Promise.all([
    idsTurno.length > 0
      ? supabase
          .from("turnos_cerrados")
          .select(
            "id, abierto_en, cerrado_en, caja_grande_inicial, caja_chica_inicial, caja_grande_final, caja_chica_final, caja_grande_esperada, caja_chica_esperada, responsables",
          )
          .in("id", idsTurno)
          .overrideTypes<Omit<TurnoDelDia, "stock">[], { merge: false }>()
      : Promise.resolve({ data: [] as Omit<TurnoDelDia, "stock">[] }),
    idsTurno.length > 0
      ? supabase
          .from("diferencias_stock")
          .select("turno_id, producto, diferencia, momento")
          .in("turno_id", idsTurno)
          .overrideTypes<(DiferenciaProducto & { turno_id: string })[]>()
      : Promise.resolve({ data: [] as (DiferenciaProducto & { turno_id: string })[] }),
  ]);

  const stockDe = (id: string) => (difStock ?? []).filter((d) => d.turno_id === id);

  // El turno abierto entra si dejo movimientos este dia —puede haber arrancado
  // ayer y seguir abierto— y ademas siempre que estemos parados en hoy, porque
  // es el bloque donde van a caer las ventas que se carguen ahora.
  const abiertoEnEsteDia = turno && (esHoy || idsTurno.includes(turno.id));

  // El salto se calcula recien cuando estan todos los turnos del dia: sale de
  // comparar cada uno con el que cerro antes.
  type TurnoDia = Omit<TurnoDelDia, "cerrado_en" | "salto"> & { cerrado_en: string | null };

  const turnosDelDia: TurnoDia[] = [
    ...(abiertoEnEsteDia && turno
      ? [
          {
            id: turno.id,
            abierto_en: turno.abierto_en,
            cerrado_en: null,
            caja_grande_inicial: turno.caja_grande_inicial,
            caja_chica_inicial: turno.caja_chica_inicial,
            caja_grande_final: null,
            caja_chica_final: null,
            caja_grande_esperada: null,
            caja_chica_esperada: null,
            responsables: turno.responsables,
            stock: stockDe(turno.id),
          },
        ]
      : []),
    ...(cerrados ?? []).map((t) => ({ ...t, stock: stockDe(t.id) })),
  ].sort((a, b) => b.abierto_en.localeCompare(a.abierto_en));

  const hoy = asistencias ?? [];
  // El aviso al abrir turno mira quién está ahora, no quién pasó hoy: el que
  // trabajó de 8 a 12 no cubre un turno que arranca a las 20.
  const trabajando = hoy.filter((a) => a.trabajando);

  // Al turno entran solo los marcados en el catálogo. Contar los 43 que llevan
  // stock, dos veces por turno, son 86 números que nadie carga.
  const aContar = (productos ?? [])
    .filter((p): p is typeof p & { stock: number } => p.contar_en_turno && p.stock !== null)
    .map((p) => ({ id: p.id, nombre: p.nombre, stock: p.stock }));

  // Lo cobrado por cada venta del turno. La cuenta de cuánto debería haber en
  // cada cajón ya no se hace acá: la trae `turno_actual`, que arranca del saldo
  // con el que se abrió.
  const pagosDeVenta = new Map<
    string,
    { efectivo: number; transferencia: number; no_paga: number }
  >();
  for (const p of pagos ?? []) {
    const acumulado =
      pagosDeVenta.get(p.venta_id) ?? { efectivo: 0, transferencia: 0, no_paga: 0 };
    acumulado[p.metodo] += p.monto;
    pagosDeVenta.set(p.venta_id, acumulado);
  }

  // Pagos de hoy contra ventas de otros dias: eso es un cobro de deuda. Se agrupan
  // por alumno y momento porque un solo cobro puede saldar varias compras.
  const idsDeHoy = new Set((ventas ?? []).map((v) => v.id));
  const cobros = new Map<string, CobroFila>();
  for (const p of (pagos ?? []).filter((p) => !idsDeHoy.has(p.venta_id) && !p.anulada_en)) {
    // Sin cargo no es plata que entró: no arma un cobro de deuda.
    if (p.metodo === "no_paga") continue;
    const clave = `${p.alumno}|${p.creado_en}`;
    const fila: CobroFila = cobros.get(clave) ?? {
      ids: [],
      alumno: p.alumno,
      efectivo: 0,
      transferencia: 0,
      turno_id: p.turno_id,
      creado_en: p.creado_en,
    };
    fila.ids.push(p.id);
    fila[p.metodo] += p.monto;
    cobros.set(clave, fila);
  }

  // Con el turno abierto la pregunta es cuanto tiene que haber ahora en el cajon
  // y de donde sale. Cuando ya no queda ninguno abierto la pregunta pasa a ser
  // la del dia entero: se arranca de lo que declaro el primer turno, se le suma
  // todo lo que paso por el cajon y eso tiene que dar lo que contaron al final.
  // Asi Clemente controla contra la plata que entrego a la mañana.
  const efectivo = efectivoDelDia(pagos ?? [], movimientos ?? []);
  const primerTurno = turnosDelDia[turnosDelDia.length - 1];
  const ultimoCierre = turnosDelDia.find((t) => t.cerrado_en !== null) ?? null;

  const cajaDe = (cual: "grande" | "chica"): EstadoCaja => {
    if (esHoy && turno) {
      return {
        estado: "abierto",
        inicial: cual === "grande" ? turno.caja_grande_inicial : turno.caja_chica_inicial,
        ventas: cual === "grande" ? turno.ventas_grande : turno.ventas_chica,
        movimientos: cual === "grande" ? turno.movimientos_grande : turno.movimientos_chica,
        esperado: cual === "grande" ? turno.caja_grande_esperada : turno.caja_chica_esperada,
      };
    }
    if (!primerTurno || !ultimoCierre) return { estado: "sin_datos" };

    const inicial =
      cual === "grande" ? primerTurno.caja_grande_inicial : primerTurno.caja_chica_inicial;
    const ventas = efectivo.ventas[cual];
    const movidos = efectivo.movimientos[cual];
    return {
      estado: "cerrado",
      inicial,
      ventas,
      movimientos: movidos,
      esperado: inicial + ventas + movidos,
      // Sin conteo final el turno lo cerro el sistema a la medianoche: no hay
      // contra que comparar y el widget lo dice.
      contado: cual === "grande" ? ultimoCierre.caja_grande_final : ultimoCierre.caja_chica_final,
    };
  };

  const totales = [
    { etiqueta: "Caja grande", caja: cajaDe("grande") },
    { etiqueta: "Caja chica", caja: cajaDe("chica") },
  ];

  type Registro =
    | ({ clase: "venta" } & VentaFila)
    | ({ clase: "movimiento" } & MovimientoFila)
    | ({ clase: "cobro" } & CobroFila);

  const todos: Registro[] = [
    // El pago que muestra la fila es el de hoy, no el historico de la venta.
    ...(ventas ?? []).map((v) => ({
      clase: "venta" as const,
      ...v,
      ...(pagosDeVenta.get(v.id) ?? { efectivo: 0, transferencia: 0, no_paga: 0 }),
    })),
    ...(movimientos ?? []).map((m) => ({ clase: "movimiento" as const, ...m })),
    ...[...cobros.values()].map((c) => ({ clase: "cobro" as const, ...c })),
  ];

  // Con un turno abierto la pantalla es la de ese turno: lo de los turnos
  // anteriores del dia no aparece hasta que cierre el ultimo. El del mostrador
  // controla su caja contra lo que ve, sin que le sumen movimientos ajenos. El
  // dia entero queda para despues, con los separadores de siempre.
  const delTurno = esHoy && turno ? todos.filter((r) => r.turno_id === turno.id) : todos;

  const metodoDe = (r: Registro) =>
    r.clase === "movimiento"
      ? capitalizar(r.metodo)
      : r.clase === "venta"
        ? nombreMetodo(r.efectivo, r.transferencia, r.no_paga)
        : nombreMetodo(r.efectivo, r.transferencia);
  const detalleDe = (r: Registro) =>
    r.clase === "venta" ? r.producto : r.clase === "cobro" ? "Cobro de deuda" : r.motivo;
  const alumnoDe = (r: Registro) =>
    r.clase === "movimiento" ? "Movimiento de caja" : r.alumno;

  // Opciones de los menús: solo lo que aparece en el día, para no listar 200 alumnos.
  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesAlumno = ordenar(delTurno.map(alumnoDe));
  const opcionesDetalle = ordenar(delTurno.map(detalleDe));
  const opcionesMetodo = ordenar(delTurno.map(metodoDe));

  const filtroAlumno = lista(alumno);
  const filtroDetalle = lista(detalle);
  const filtroMetodo = lista(metodo);

  const registros = delTurno
    .filter(
      (r) =>
        (filtroAlumno.length === 0 || filtroAlumno.includes(alumnoDe(r))) &&
        (filtroDetalle.length === 0 || filtroDetalle.includes(detalleDe(r))) &&
        (filtroMetodo.length === 0 || filtroMetodo.includes(metodoDe(r))),
    )
    .sort((a, b) =>
      orden === "antiguo"
        ? a.creado_en.localeCompare(b.creado_en)
        : b.creado_en.localeCompare(a.creado_en),
    );

  const hayFiltro = filtroAlumno.length + filtroDetalle.length + filtroMetodo.length > 0;

  // La lista que se dibuja: cada turno con su cabecera y abajo sus movimientos.
  // Los turnos van del mas nuevo al mas viejo, y adentro de cada uno los
  // movimientos siguen el orden que pida la columna Hora.
  type Fila = { clase: "turno"; turno: TurnoDelDia } | { clase: "fila"; registro: Registro };
  const saltos = saltosEntreTurnos(turnosDelDia);
  const filas: Fila[] = turnosDelDia.flatMap((t) => {
    const suyos = registros
      .filter((r) => r.turno_id === t.id)
      .map((registro) => ({ clase: "fila" as const, registro }));
    // El turno abierto no lleva cabecera: va arriba de todo y el encabezado de
    // la pagina ya dice desde cuando viene y quien esta a cargo.
    if (t.cerrado_en === null) return suyos;
    // Uno cerrado sin movimientos tampoco: no hay bloque que encabezar.
    if (suyos.length === 0) return [];
    return [
      {
        clase: "turno" as const,
        turno: { ...t, cerrado_en: t.cerrado_en, salto: saltos.get(t.id) ?? null },
      },
      ...suyos,
    ];
  });

  // Los dias elegibles. Hoy entra siempre: si todavia no se cargo nada, el
  // calendario no puede arrancar parado en un dia deshabilitado.
  const diasElegibles = [...new Set([...(dias ?? []).map((d) => d.dia as string), hoyDia])].sort();
  const bloqueoPorFecha = esHoy
    ? undefined
    : `Estás viendo el ${dia.split("-").reverse().join("/")}. Volvé a hoy para cargar movimientos.`;

  async function borrarMov(formData: FormData) {
    "use server";
    await borrarMovimiento(String(formData.get("id")));
  }

  async function borrarCobro(formData: FormData) {
    "use server";
    // Un cobro puede haberse repartido en varios pagos: se van todos juntos.
    for (const id of String(formData.get("id")).split(",")) await borrarPago(id);
  }

  async function borrar(formData: FormData) {
    "use server";
    await borrarVenta(String(formData.get("id")));
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-heading-20">Mostrador</h1>
          <p className="text-copy-14 text-[var(--ds-gray-900)]">
            {esHoy && turno ? (
              <>
                A cargo:{" "}
                <span className="text-[var(--ds-gray-1000)]">
                  {/* Sale del fichaje: el que tenga asistencia dentro del rango
                      del turno estuvo en el turno. */}
                  {turno.responsables.length === 0
                    ? "nadie fichó"
                    : turno.responsables.join(", ")}
                </span>
                {" · turno desde las "}
                {horaCorta(turno.abierto_en)}
                {registros.length > 0 &&
                  ` · ${registros.length} ${registros.length === 1 ? "movimiento" : "movimientos"}`}
              </>
            ) : (
              <>
                {turnosDelDia.length === 0
                  ? "Sin turnos"
                  : `${turnosDelDia.length} ${turnosDelDia.length === 1 ? "turno" : "turnos"}`}
                {registros.length > 0 &&
                  ` · ${registros.length} ${registros.length === 1 ? "movimiento" : "movimientos"}`}
                {esHoy && !turno && " · turno cerrado"}
              </>
            )}
          </p>
        </div>

        <SelectorDia dia={dia} dias={diasElegibles} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {esHoy && turno && (
              <CerrarTurnoModal
                esperadoGrande={turno.caja_grande_esperada}
                esperadoChica={turno.caja_chica_esperada}
                responsables={turno.responsables}
                productos={aContar}
              />
            )}
            {/* Fichar no depende del turno: se llega antes de abrirlo. */}
            <AsistenciaModal empleados={empleados ?? []} asistencias={hoy} />
          </div>

          {/* Sin turno abierto, o parado en un día que ya pasó, los dos quedan
              bloqueados: cargar iría al turno de hoy y no al día que se ve. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* render: el botón del sistema se dibuja como link, sin anidar <a><button>.
                nativeButton en false para que Base UI no espere un <button> real. */}
            <Button variant="secondary" nativeButton={false} render={<Link href="/productos" />}>
              Productos
            </Button>
            <AccionesModal
              alumnos={alumnos ?? []}
              categorias={categorias ?? []}
              bloqueado={!turno || !esHoy}
              motivoBloqueo={bloqueoPorFecha}
            />
            <NuevaVentaModal
              alumnos={alumnos ?? []}
              productos={productos ?? []}
              promos={promos ?? []}
              bloqueado={!turno || !esHoy}
              motivoBloqueo={bloqueoPorFecha}
            />
          </div>
        </div>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {totales.map((t) => (
            <CajaCard key={t.etiqueta} {...t} />
          ))}
        </section>

        {/* Iniciar turno solo aparece parado en hoy: abrir un turno con fecha de
            la semana pasada no existe. */}
        {esHoy && !turno && registros.length === 0 ? (
          <EmptyState
            icon={<CartIcon />}
            title="No hay ningún turno abierto"
            description="Para cargar ventas, cobros o movimientos de caja tenés que iniciar el turno contando la caja y el stock."
            action={<TurnoModal trabajando={trabajando} productos={aContar} />}
          />
        ) : registros.length === 0 ? (
          <EmptyState
            icon={<CartIcon />}
            title={
              hayFiltro
                ? "Nada coincide con el filtro"
                : esHoy && turno
                  ? "Sin movimientos en este turno"
                  : "Sin movimientos este día"
            }
            description={
              hayFiltro
                ? "Probá quitando el filtro desde el encabezado de la columna."
                : esHoy
                  ? "Cargá las ventas y los movimientos de caja con el botón de arriba y aparecen acá."
                  : "Ese día no quedó nada anotado."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
            <TableRoot className="md:max-h-[calc(100vh-21rem)]">
              <Table aria-label="Movimientos del día">
                <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                  <TableRow>
                    <TableHead>
                      <FiltroColumna
                        etiqueta="Hora"
                        orden={{
                          param: "orden",
                          opciones: [
                            { valor: "reciente", label: "Más reciente" },
                            { valor: "antiguo", label: "Más antiguo" },
                          ],
                        }}
                      />
                    </TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="Alumno" param="alumno" opciones={opcionesAlumno} />
                    </TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="Detalle" param="detalle" opciones={opcionesDetalle} />
                    </TableHead>
                    <TableHead>Cant.</TableHead>
                    <TableHead>
                      <FiltroColumna etiqueta="Método" param="metodo" opciones={opcionesMetodo} />
                    </TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead numeric>Total</TableHead>
                    <TableHead className="text-center" />
                  </TableRow>
                </TableHeader>
                <TableBody striped>
                  {filas.map((f) => {
                    // La cabecera del turno ocupa toda la fila: asi la tabla no
                    // pierde el alineado de columnas ni el encabezado pegajoso.
                    if (f.clase === "turno") {
                      return (
                        <TableRow key={`turno-${f.turno.id}`} className="!bg-transparent">
                          <TableCell colSpan={8} className="whitespace-normal !p-0">
                            <TurnoSeparador turno={f.turno} />
                          </TableCell>
                        </TableRow>
                      );
                    }
                    const r = f.registro;
                    const anulado =
                      r.clase === "venta"
                        ? r.anulada_en
                        : r.clase === "movimiento"
                          ? r.anulado_en
                          : null;
                    const id = r.clase === "cobro" ? r.ids.join(",") : r.id;
                    return (
                      <TableRow
                        key={`${r.clase}-${id}`}
                        className={anulado ? "text-muted-foreground" : undefined}
                      >
                        <TableCell>
                          {horaCorta(r.creado_en)}
                        </TableCell>

                        {r.clase === "venta" ? (
                          <>
                            <TableCell>{r.alumno}</TableCell>
                            <TableCell>{r.producto}</TableCell>
                            <TableCell>{r.cantidad}</TableCell>
                            <TableCell>
                              {anulado ? (
                                <Badge variant="red-subtle">anulada</Badge>
                              ) : (
                                nombreMetodo(r.efectivo, r.transferencia, r.no_paga)
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {pesos(r.efectivo + r.transferencia)}
                                {r.saldo > 0 && (
                                  <Badge variant="amber-subtle">Debe {pesos(r.saldo)}</Badge>
                                )}
                                {r.saldo < 0 && (
                                  <Badge variant="blue-subtle">A favor {pesos(-r.saldo)}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell numeric>
                              <span className={anulado ? "line-through" : undefined}>
                                {pesos(r.total)}
                              </span>
                            </TableCell>
                          </>
                        ) : r.clase === "cobro" ? (
                          <>
                            <TableCell>{r.alumno}</TableCell>
                            <TableCell>Cobro de deuda</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>{nombreMetodo(r.efectivo, r.transferencia)}</TableCell>
                            <TableCell>{pesos(r.efectivo + r.transferencia)}</TableCell>
                            <TableCell numeric>—</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-muted-foreground capitalize">
                              Caja {r.caja}
                            </TableCell>
                            <TableCell>{r.motivo}</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>
                              {anulado ? (
                                <Badge variant="red-subtle">anulado</Badge>
                              ) : (
                                <span className="capitalize">{r.metodo}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span
                                className={
                                  anulado
                                    ? "line-through"
                                    : r.tipo === "ingreso"
                                      ? "text-[var(--ds-green-900)]"
                                      : "text-[var(--ds-amber-900)]"
                                }
                              >
                                {r.tipo === "ingreso" ? "+" : "−"}
                                {pesos(r.monto)}
                              </span>
                            </TableCell>
                            <TableCell numeric>—</TableCell>
                          </>
                        )}

                        <TableCell className="text-center">
                          {(
                            <form
                              action={
                                r.clase === "venta"
                                  ? borrar
                                  : r.clase === "cobro"
                                    ? borrarCobro
                                    : borrarMov
                              }
                            >
                              <Button
                                type="submit"
                                variant="tertiary"
                                size="sm"
                                // Sin esto un lector de pantalla oye "Eliminar"
                                // veinte veces y ninguna dice qué se elimina.
                                aria-label={`Eliminar ${detalleDe(r).toLowerCase()} de ${alumnoDe(r)}`}
                                className="hover:bg-[var(--ds-red-200)] hover:text-[var(--ds-red-900)]"
                              >
                                Eliminar
                              </Button>
                              <input type="hidden" name="id" value={id} />
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableRoot>
          </div>
        )}
    </main>
  );
}
