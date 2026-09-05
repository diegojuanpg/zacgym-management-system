import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { comoQuery } from "@/lib/query";
import { FiltrosLocales } from "@/hooks/use-navegacion";
import { horaCorta } from "@/lib/utils";
import {
  TablaMostrador,
  type VentaFila,
  type PagoFila,
  type MovimientoFila,
  type CobroFila,
} from "./tabla";
import { inicioDelDia, hoyEnBsAs, rangoDelDia } from "@/lib/utils";
import { NuevaVentaModal } from "@/components/mostrador/nueva-venta-modal";
import { AccionesModal } from "@/components/mostrador/acciones-modal";
import { TurnoModal } from "@/components/mostrador/turno-modal";
import { CerrarTurnoModal } from "@/components/mostrador/cerrar-turno-modal";
import { CheckInModal } from "@/components/mostrador/checkin-modal";
import type { Asistencia } from "@/lib/asistencias";
import {
  CajaCard,
  type EstadoCaja,
  type Alcance,
  type Entrega,
} from "@/components/mostrador/caja-card";
import { efectivoDelDia } from "@/lib/caja";
import { SelectorDia } from "@/components/mostrador/selector-dia";
import type { TurnoDelDia, DiferenciaProducto } from "@/components/mostrador/turno-separador";
import { Button } from "@/components/ui/button";


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

export default async function MostradorPage({ searchParams }: PageProps<"/mostrador">) {
  await requireStaff();
  const { fecha } = await searchParams;
  // El mostrador arranca en hoy y se puede mover a cualquier día que tenga algo
  // cargado. Un turno cerrado deja de vaciar la pantalla: sus movimientos siguen
  // en el día que pasaron, que es lo que el del turno siguiente necesita ver.
  const hoyDia = hoyEnBsAs();
  const dia = typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoyDia;
  const esHoy = dia === hoyDia;
  const { desde, hasta } = rangoDelDia(dia);

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
    { data: deudas },
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
      // Los check-in de hoy, no solo los abiertos: el que entró a las 7 y se
      // fue a las 15 tiene que seguir viéndose hasta que cierre el día.
      //
      // Y el que sigue adentro aparece aunque haya entrado ayer: el turno noche
      // ficha a las 22 y sale a las 2, y a las 00:01 no puede desaparecer de la
      // lista mientras está atendiendo.
      supabase
        .from("asistencias_detalle")
        .select("id, empleado_id, nombre, entro, inicia, termina, trabajando")
        .or(`entro.gte.${inicioDelDia()},trabajando.is.true`)
        .order("entro")
        .overrideTypes<Asistencia[]>(),
      supabase.from("alumno_promo").select("alumno_id, promo, producto_id, producto, precio"),
      supabase.from("tarea_categorias").select("id, nombre").order("nombre"),
      // Los dias que tienen algo cargado: son los unicos elegibles en el calendario.
      supabase.from("dias_con_ventas").select("dia").order("dia"),
      // Las compras impagas, una por una: es lo que se cobra en el modal. El
      // historico de la planilla queda afuera, igual que en el balance.
      supabase
        .from("ventas_saldo")
        .select("id, alumno_id, producto, saldo")
        .gt("saldo", 0)
        .is("anulada_en", null)
        .not("turno_id", "is", null)
        .order("creado_en")
        .overrideTypes<
          { id: string; alumno_id: string; producto: string; saldo: number }[]
        >(),
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
      "id, alumno, alumno_id, producto, producto_id, cantidad, total, efectivo, transferencia, no_paga, a_favor, saldo, turno_id, creado_en, anulada_en",
    ),
    porDia<PagoFila>(
      "pagos_detalle",
      "id, venta_id, alumno, alumno_id, producto, monto, metodo, caja, turno_id, creado_en, anulada_en, vendedor",
    ),
    porDia<MovimientoFila>(
      "movimientos_caja_detalle",
      "id, tipo, caja, metodo, monto, motivo, delta, turno_id, creado_en, anulado_en",
    ),
  ]);

  // Los turnos abiertos ese dia. Antes la lista salia solo de la actividad
  // —ventas, pagos, movimientos— y un turno que abrio, conto la caja y no
  // vendio nada no aparecia en ninguna parte, aunque hubiera cerrado con
  // diferencias. Un turno existe porque alguien lo abrio, no porque haya
  // vendido.
  const { data: abiertosEseDia } = await supabase
    .from("turnos")
    .select("id")
    .gte("abierto_en", desde)
    .lt("abierto_en", hasta)
    .overrideTypes<{ id: string }[]>();

  // Y ademas los que dejaron actividad ese dia aunque hayan abierto el dia
  // anterior: un turno de noche cruza la medianoche.
  const idsTurno = [
    ...new Set([
      ...(abiertosEseDia ?? []).map((t) => t.id),
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
    // La imputación de saldo a favor no es plata cobrada hoy: la fila de la
    // venta la muestra aparte, con la columna `a_favor` de la vista.
    if (p.metodo === "a_favor") continue;
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
    // Sin cargo no es plata que entró, y una imputación de saldo a favor
    // tampoco: son las dos caras de una plata que ya se cobró antes.
    if (p.metodo === "no_paga" || p.metodo === "a_favor") continue;
    const clave = `${p.alumno}|${p.creado_en}`;
    const fila: CobroFila = cobros.get(clave) ?? {
      ids: [],
      alumno: p.alumno,
      alumno_id: p.alumno_id,
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

  const alcance: Alcance = esHoy && turno ? "turno" : "dia";

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

  // Lo cobrado de productos que no son del GYM, por caja y por dueño. Del mismo
  // recorte que las cajas: con un turno abierto, ese turno; si no, el día. Entra
  // lo efectivamente cobrado —`no_paga` no y `a_favor` tampoco, que es plata que
  // ya se cobró antes— y no entra lo de una venta anulada.
  //
  // La caja sale del producto, igual que el resto: el que vende en las dos
  // aparece en las dos tarjetas, cada una con lo suyo.
  const porEntregar = new Map<string, Entrega>();
  for (const p of pagos ?? []) {
    if (p.vendedor === null || p.anulada_en !== null) continue;
    if (p.metodo !== "efectivo" && p.metodo !== "transferencia") continue;
    if (esHoy && turno && p.turno_id !== turno.id) continue;
    const clave = `${p.caja}|${p.vendedor}`;
    const acumulado = porEntregar.get(clave) ?? {
      nombre: p.vendedor,
      efectivo: 0,
      transferencia: 0,
    };
    acumulado[p.metodo] += p.monto;
    porEntregar.set(clave, acumulado);
  }
  const entregasDe = (cual: "grande" | "chica") =>
    [...porEntregar]
      .filter(([clave]) => clave.startsWith(`${cual}|`))
      .map(([, entrega]) => entrega)
      // El que más plata dejó primero: es el que más urge entregar.
      .sort((a, b) => b.efectivo + b.transferencia - (a.efectivo + a.transferencia));

  const totales = [
    // Con un turno abierto la pantalla es la de ese turno; sin ninguno, la del
    // dia entero. El primer renglon de la tarjeta lo dice.
    { etiqueta: "Caja grande", caja: cajaDe("grande"), alcance, entregas: entregasDe("grande") },
    { etiqueta: "Caja chica", caja: cajaDe("chica"), alcance, entregas: entregasDe("chica") },
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

  // Y la lista de turnos se recorta igual. Si no, los turnos anteriores del dia
  // aparecen como bloques sin nada abajo —sus ventas estan ocultas, no es que no
  // hayan vendido— y estorban justo cuando estas atendiendo. Cerrado el ultimo
  // turno, el dia se ve entero.
  const turnosVisibles = esHoy && turno ? turnosDelDia.filter((t) => t.id === turno.id) : turnosDelDia;

  const query = comoQuery(await searchParams);

  // Los dias elegibles. Hoy entra siempre: si todavia no se cargo nada, el
  // calendario no puede arrancar parado en un dia deshabilitado.
  const diasElegibles = [...new Set([...(dias ?? []).map((d) => d.dia as string), hoyDia])].sort();
  const bloqueoPorFecha = esHoy
    ? undefined
    : `Estás viendo el ${dia.split("-").reverse().join("/")}. Volvé a hoy para cargar movimientos.`;

  return (
    <main className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-heading-20">Mostrador</h1>
          <p className="text-copy-14 text-muted-foreground">
            {esHoy && turno ? (
              <>
                {/* Sale del check-in: el que tenga un turno declarado dentro
                    del rango del turno de caja estuvo en el turno. */}
                {turno.responsables.length === 0
                  ? "Nadie fichó"
                  : turno.responsables.join(", ")}
                {" · desde "}
                {horaCorta(turno.abierto_en)}
              </>
            ) : turnosDelDia.length === 0 ? (
              esHoy ? "Turno cerrado" : "Sin turnos"
            ) : (
              `${turnosDelDia.length} ${turnosDelDia.length === 1 ? "turno" : "turnos"}`
            )}
          </p>
        </div>

        <SelectorDia dia={dia} dias={diasElegibles} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* Abrir y cerrar viven en la barra, no en el estado vacío: después
                de cerrar un turno con movimientos la tabla sigue llena y el
                botón de iniciar el siguiente no tiene dónde aparecer. */}
            {esHoy &&
              (turno ? (
                <CerrarTurnoModal
                  esperadoGrande={turno.caja_grande_esperada}
                  esperadoChica={turno.caja_chica_esperada}
                  productos={aContar}
                />
              ) : (
                <TurnoModal trabajando={trabajando} productos={aContar} />
              ))}
            {/* El check-in no depende del turno: se llega antes de abrirlo. */}
            <CheckInModal empleados={empleados ?? []} asistencias={hoy} />
          </div>

          {/* Sin turno abierto, o parado en un día que ya pasó, los dos quedan
              bloqueados: cargar iría al turno de hoy y no al día que se ve. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* render: el botón del sistema se dibuja como link, sin anidar <a><button>.
                nativeButton en false para que Base UI no espere un <button> real. */}
            <Button variant="secondary" nativeButton={false} render={<Link href="/alumnos/promos" />}>
              Promos
            </Button>
            <Button variant="secondary" nativeButton={false} render={<Link href="/productos" />}>
              Productos
            </Button>
            <AccionesModal
              alumnos={alumnos ?? []}
              categorias={categorias ?? []}
              empleados={empleados ?? []}
              bloqueado={!turno || !esHoy}
              motivoBloqueo={bloqueoPorFecha}
            />
            <NuevaVentaModal
              alumnos={alumnos ?? []}
              productos={productos ?? []}
              deudas={(deudas ?? []).map((d) => ({
                venta_id: d.id,
                alumno_id: d.alumno_id,
                producto: d.producto,
                debe: d.saldo,
              }))}
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

        <FiltrosLocales key={query} inicial={query}>
          <TablaMostrador
            registros={delTurno}
            turnos={turnosVisibles}
            esHoy={esHoy}
            hayTurno={turno !== null}
          />
        </FiltrosLocales>
    </main>
  );
}
