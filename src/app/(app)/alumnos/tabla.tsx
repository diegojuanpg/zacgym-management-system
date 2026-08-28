"use client";

import Link from "next/link";
import { Buscador } from "@/components/buscador";
import { Torta } from "@/components/torta";
import { Entrenamiento } from "@/components/alumnos/entrenamiento";
import {
  BarrasCheckins,
  type DiaConCheckins,
  type SemanaConCheckins,
} from "@/components/barras-checkins";
import { TabsUrl } from "@/components/tabs-url";
import { ToggleUrl } from "@/components/toggle-url";
import { FiltroColumna } from "@/components/filtro-columna";
import { MostrarMas } from "@/components/mostrar-mas";
import { recortar } from "@/lib/recorte";
import { AlumnoModal } from "@/components/alumnos/alumno-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTimeCard } from "@/components/ui/relative-time-card";
import { UsersIcon } from "@/components/icons";
import {
  TableRoot,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableColgroup,
  TableCol,
} from "@/components/ui/table";
import { fechaCorta } from "@/lib/utils";
import { rangoDe, comparador, lunes } from "@/lib/filtros";
import { comoObjeto, useParametros } from "@/hooks/use-navegacion";

const ZONA = "America/Argentina/Buenos_Aires";

const ESTADO_COLOR = {
  Activo: "blue",
  Inactivo: "red",
} as const;
const pesos = (n: number) => `$${n.toLocaleString("es-AR")}`;
// gray-600 sobre blanco da 2.3:1 y no pasa AA; gray-900 pasa en los dos temas y
// sigue leyéndose como "acá no hay dato" y no como contenido.
const vacio = (
  <span className="text-[var(--ds-gray-900)]" aria-label="sin dato">
    —
  </span>
);

const GENERO = { femenino: "Femenino", masculino: "Masculino", otro: "Otro" } as const;

/** Apellido, nombre, género, edad, entrenamiento, actividad, vencimiento, estado, balance [, número, mail], acciones. */
const ANCHOS = {
  conContacto: ["9%", "10%", "7%", "5%", "9%", "8%", "9%", "7%", "8%", "9%", "12%", "7%"],
  sinContacto: ["12%", "13%", "9%", "6%", "11%", "11%", "11%", "9%", "11%", "7%"],
};

/** Los días importan más que la fecha exacta: "hace 3 días" se lee de un vistazo. */
function haceCuanto(iso: string | null) {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 30) return `Hace ${dias} días`;
  if (dias < 60) return "Hace 1 mes";
  return `Hace ${Math.floor(dias / 30)} meses`;
}

/** Dormido: no movió plata en 30 días. Es el que hay que salir a buscar. */
function estaDormido(ultima: string | null) {
  return ultima === null || Date.now() - new Date(ultima).getTime() > 30 * 86400000;
}

export interface FilaAlumno {
  id: string;
  apellido: string;
  nombre: string;
  celular: string | null;
  email: string | null;
  nacimiento: string | null;
  edad: number | null;
  genero: keyof typeof GENERO | null;
  vence: string | null;
  saldo: number;
  activo: boolean;
  ultima_actividad: string | null;
  /** La planilla de rutina del alumno en Drive. Solo se usa para linkearla. */
  sheet_id: string | null;
  /** La semana que tiene abierta en su planilla, que lee el pipeline. */
  rutina_semana: string | null;
  /** Por qué no hay semana: "Revisar" si quedó con dos bloques visibles. */
  rutina_estado: string | null;
}

/**
 * La tabla entera: solapas, buscador, filtros de encabezado y filas.
 *
 * Recibe los alumnos una vez y de ahí en más trabaja sola. Lo que antes decidía
 * el server —qué vista, qué orden, qué filtros— sale de `useParametros()`, que
 * adentro de `FiltrosLocales` es estado de React y no la URL.
 */
export function TablaAlumnos({
  alumnos: todos,
  dias,
  semanas,
}: {
  alumnos: FilaAlumno[];
  dias: DiaConCheckins[];
  semanas: SemanaConCheckins[];
}) {
  const parametros = useParametros();
  const params = comoObjeto(parametros);
  const busqueda = (parametros.get("q") ?? "").trim();
  // El contacto viene oculto: son dos columnas que casi nunca se miran y que
  // corren el resto de la tabla fuera de la pantalla. Se pide con ?contacto=si.
  const verContacto = parametros.get("contacto") === "si";
  const vista = parametros.get("ver") ?? "todos";
  const criterio = parametros.get("orden") ?? "";
  const filas = parametros.get("filas") ?? undefined;
  // Un filtro se manda como el mismo parámetro repetido: ?apellido=X&apellido=Y.
  const lista_ = (nombre: string) => parametros.getAll(nombre);

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });
  const lunesActual = lunes(hoy);
  const desdeLunes = lunes(hoy, 1);
  // Vino esta semana o la pasada. Dos semanas y no una: el pipeline sincroniza
  // los check-ins a las 3am, así que "vino esta semana" un lunes a la mañana no
  // es nadie —lo del lunes entra el martes— y las listas quedarían vacías todos
  // los lunes, que es el día de más gente.
  const viene = (a: FilaAlumno) =>
    a.ultima_actividad !== null && diaDe(a.ultima_actividad) >= desdeLunes;
  const alDia = (a: FilaAlumno) => a.vence !== null && a.vence >= hoy;
  /**
   * Sigue entrenando después de que se le venció.
   *
   * No alcanza con que haya venido hace poco: si la cuota se le venció el
   * jueves y entrenó el lunes, ese entrenamiento estaba pago y no prueba nada.
   * Se comparan las dos fechas, que las tenemos, en vez de aproximarlo con
   * semanas. Sin fecha de vencimiento no hay contra qué comparar, así que
   * alcanza con haber venido.
   */
  const entrenaVencido = (a: FilaAlumno) =>
    viene(a) && (a.vence === null || diaDe(a.ultima_actividad!) > a.vence);
  const vencido = (a: FilaAlumno) => a.vence !== null && a.vence < hoy;
  const dormido = (a: FilaAlumno) => estaDormido(a.ultima_actividad);
  // Estado contesta una sola pregunta: ¿este sigue siendo alumno? Activo es el
  // que vino a entrenar esta semana o la pasada, o tiene la cuota al dia aunque
  // no haya venido. Inactivo es todo lo demas: se le vencio y no aparece, o
  // nunca estuvo en el padron.
  //
  // No hay un estado "Vencido" aparte porque no le quedaba nadie: el que vencio
  // o esta viniendo —y entonces es Activo— o no, y entonces es Inactivo. Que
  // ademas deba la renovacion lo canta la columna Vencimiento, en rojo y con la
  // fecha; decirlo dos veces no agregaba nada.
  const estadoDe = (a: FilaAlumno) =>
    a.activo && (alDia(a) || entrenaVencido(a)) ? "Activo" : "Inactivo";
  const generoDe = (a: FilaAlumno) => (a.genero ? GENERO[a.genero] : "Sin especificar");

  /**
   * La columna Entrenamiento, en cuatro categorías que se pueden accionar.
   *
   * La fecha suelta no sirve de filtro —serían decenas de opciones— pero lo que
   * se quiere saber es otra cosa: quién está atrasado y a quién hay que ir a
   * mirarle la planilla. "Sin leer" son los que quedan fuera del criterio del
   * pipeline: solo se les mira la planilla a los que entrenaron el último mes o
   * tienen la cuota al día.
   */
  const entrenamientoDe = (a: FilaAlumno) =>
    a.rutina_estado !== null
      ? "Revisar"
      : a.rutina_semana === null
        ? "Sin leer"
        : a.rutina_semana >= lunesActual
          ? "Al día"
          : "Atrasada";
  // Las cuatro ventanas de vencimiento, todas adentro de Activos y sin pisarse:
  // cada alumno que entrena cae en una sola. Las semanas son calendario porque
  // la cuota vence un día puntual, no en una ventana rodante.
  const esActivo = (a: FilaAlumno) => estadoDe(a) === "Activo";
  const vence = (a: FilaAlumno, desde: string | null, hasta: string | null) =>
    a.vence !== null && (desde === null || a.vence >= desde) && (hasta === null || a.vence < hasta);

  const venceDespues = (a: FilaAlumno) => esActivo(a) && vence(a, lunes(hoy, -1), null);
  const venceEstaSemana = (a: FilaAlumno) => esActivo(a) && vence(a, lunesActual, lunes(hoy, -1));
  const vencioLaPasada = (a: FilaAlumno) => esActivo(a) && vence(a, desdeLunes, lunesActual);
  // El que entrena y ya lleva más de una semana sin renovar: pararlo en el
  // mostrador no alcanzó, hay que escribirle.
  const notificar = (a: FilaAlumno) => esActivo(a) && vence(a, null, desdeLunes);

  const porciones = [
    { nombre: "Al día", cuantos: todos.filter(venceDespues).length, color: "var(--ds-blue-700)" },
    {
      nombre: "Vence esta semana",
      cuantos: todos.filter(venceEstaSemana).length,
      color: "var(--ds-amber-800)",
    },
    {
      nombre: "Venció la semana pasada",
      cuantos: todos.filter(vencioLaPasada).length,
      color: "var(--ds-red-800)",
    },
    {
      nombre: "Notificar",
      cuantos: todos.filter(notificar).length,
      color: "var(--ds-red-900)",
      trama: true,
    },
    {
      // Sin fecha no se puede decir en qué semana vence. Hoy no hay ninguno, y
      // la porción no se dibuja mientras siga así.
      nombre: "Sin vencimiento",
      cuantos: todos.filter((a) => esActivo(a) && a.vence === null).length,
      color: "var(--ds-gray-600)",
    },
  ];

  const vistas = [
    { valor: "todos", nombre: "Todos", filtro: () => true },
    { valor: "activos", nombre: "Activos", filtro: esActivo },
    { valor: "vence", nombre: "Vence esta semana", filtro: venceEstaSemana },
    { valor: "vencio", nombre: "Venció la semana pasada", filtro: vencioLaPasada },
    { valor: "notificar", nombre: "Notificar", filtro: notificar },
  ].map((v) => ({ ...v, cuantos: todos.filter(v.filtro).length }));
  const vistaActual = vistas.find((v) => v.valor === vista) ?? vistas[0];

  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesApellido = ordenar(todos.map((a) => a.apellido));
  const opcionesEstado = ordenar(todos.map(estadoDe));
  const opcionesGenero = ordenar(todos.map(generoDe));

  const opcionesEntrenamiento = ordenar(todos.map(entrenamientoDe));

  const filtroApellido = lista_("apellido");
  const filtroEntrenamiento = lista_("entrenamiento");
  const rangoSemana = rangoDe(parametros.get("semana") ?? undefined);
  const filtroEstado = lista_("estado");
  const filtroGenero = lista_("genero");
  // Los mismos filtros que en Ventas: un rango para las fechas y una
  // comparacion para la plata. El vencimiento ya viene como "2026-08-20", asi
  // que se compara como texto; la actividad es un instante y hay que pasarla a
  // dia de Buenos Aires antes.
  const rangoVence = rangoDe(parametros.get("vence") ?? undefined);
  const rangoActividad = rangoDe(parametros.get("actividad") ?? undefined);
  const filtroSaldo = comparador(parametros.get("saldo") ?? undefined);
  const texto = busqueda.toLowerCase();

  const lista = todos
    .filter(
      (a) =>
        vistaActual.filtro(a) &&
        (filtroApellido.length === 0 || filtroApellido.includes(a.apellido)) &&
        (filtroEstado.length === 0 || filtroEstado.includes(estadoDe(a))) &&
        (filtroGenero.length === 0 || filtroGenero.includes(generoDe(a))) &&
        (filtroEntrenamiento.length === 0 || filtroEntrenamiento.includes(entrenamientoDe(a))) &&
        // Sin semana no entra en ningún rango: no es "la más vieja", es que no hay dato.
        (rangoSemana.desde === "" ||
          (a.rutina_semana !== null && a.rutina_semana >= rangoSemana.desde)) &&
        (rangoSemana.hasta === "" ||
          (a.rutina_semana !== null && a.rutina_semana <= rangoSemana.hasta)) &&
        // Sin fecha no entra en ningun rango: no es "antes de todo", es que no hay dato.
        (rangoVence.desde === "" || (a.vence !== null && a.vence >= rangoVence.desde)) &&
        (rangoVence.hasta === "" || (a.vence !== null && a.vence <= rangoVence.hasta)) &&
        (rangoActividad.desde === "" ||
          (a.ultima_actividad !== null && diaDe(a.ultima_actividad) >= rangoActividad.desde)) &&
        (rangoActividad.hasta === "" ||
          (a.ultima_actividad !== null && diaDe(a.ultima_actividad) <= rangoActividad.hasta)) &&
        (filtroSaldo === null || filtroSaldo(a.saldo)) &&
        (texto === "" ||
          `${a.apellido} ${a.nombre} ${a.celular ?? ""} ${a.email ?? ""}`
            .toLowerCase()
            .includes(texto)),
    )
    .sort((a, b) => {
      // Sin fecha va último en los dos sentidos: no es "el más viejo", es que no hay dato.
      const porFecha = (x: string | null, y: string | null, desc: boolean) => {
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return desc ? y.localeCompare(x) : x.localeCompare(y);
      };
      switch (criterio) {
        case "za":
          return b.apellido.localeCompare(a.apellido, "es") || b.nombre.localeCompare(a.nombre, "es");
        case "edad-asc":
          return (a.edad ?? 999) - (b.edad ?? 999);
        case "edad-desc":
          return (b.edad ?? -1) - (a.edad ?? -1);
        case "act-reciente":
          return porFecha(a.ultima_actividad, b.ultima_actividad, true);
        case "act-antiguo":
          return porFecha(a.ultima_actividad, b.ultima_actividad, false);
        case "semana-vieja":
          return porFecha(a.rutina_semana, b.rutina_semana, false);
        case "semana-nueva":
          return porFecha(a.rutina_semana, b.rutina_semana, true);
        case "vence-cerca":
          return porFecha(a.vence, b.vence, false);
        case "vence-lejos":
          return porFecha(a.vence, b.vence, true);
        case "debe":
          return b.saldo - a.saldo;
        case "favor":
          return a.saldo - b.saldo;
        default:
          return a.apellido.localeCompare(b.apellido, "es") || a.nombre.localeCompare(b.nombre, "es");
      }
    });

  // Son casi 2000 alumnos: dibujarlos todos hace la pagina inusable. La cuenta
  // de las solapas y las opciones de los filtros siguen saliendo de la lista
  // entera, solo se recorta lo que se pinta.
  const { tope, visibles } = recortar(lista, filas);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-heading-20">Alumnos</h1>

      {/* Las tarjetas ocupan lo que miden y se acomodan una al lado de la otra:
          estirarlas a media pagina dejaba el anillo nadando en un rectangulo
          vacio. */}
      <div className="flex flex-wrap gap-4">
        <div className="material-base flex w-fit flex-col rounded-lg border border-[var(--ds-gray-alpha-400)] p-4">
          <h2 className="mb-3 text-heading-16">Alumnos activos</h2>
          <div className="min-h-0 flex-1">
            <Torta porciones={porciones} etiquetaTotal="activos" />
          </div>
        </div>

        {/* El de barras se estira con lo que sobra: es el que gana con el ancho,
            porque son siete u ocho barras al lado de otras. */}
        <div className="material-base min-w-80 flex-1 rounded-lg border border-[var(--ds-gray-alpha-400)] p-4">
          <BarrasCheckins dias={dias} semanas={semanas} hoy={hoy} />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Vistas guardadas, como cualquier CRM: cada una es una URL. El filtro
            se queda en el server: una función no cruza al cliente. */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsUrl
            param="ver"
            valor={vistaActual.valor}
            vistas={vistas.map(({ valor, nombre, cuantos }) => ({ valor, nombre, cuantos }))}
          />
        </div>

        {/* Contacto va de este lado y no con las solapas: las solapas eligen qué
            filas ves, y esto —como el buscador— cambia cómo mirás las mismas.
            Entre las pastillas era un interruptor suelto en una fila de botones. */}
        <div className="flex items-center gap-3">
          <ToggleUrl
            param="contacto"
            etiqueta="Contacto"
            encendido={verContacto}
            predeterminado={false}
          />
          <Button variant="secondary" nativeButton={false} render={<Link href="/alumnos/promos" />}>
            Promos
          </Button>
          <Buscador inicial={busqueda} placeholder="Buscar por nombre, mail o teléfono..." />
        </div>
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={todos.length === 0 ? "No hay alumnos cargados" : "Nadie coincide"}
          description={
            todos.length === 0
              ? "Cargá el primero desde Acciones, en el mostrador."
              : "Probá con otra búsqueda o sacá los filtros de los encabezados."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--ds-gray-alpha-400)] bg-[var(--ds-background-100)] px-3 py-2">
          {/* La tabla scrollea adentro y el encabezado queda clavado arriba: con
              200 fichas, saber qué columna estás mirando importa más que ver la
              página entera de una. */}
          <TableRoot className="md:max-h-[calc(100vh-15rem)]">
            <Table aria-label={`Alumnos: ${vistaActual.nombre}`}>
              {/* Sin anchos, Mail y Número se quedan con lo que sobra y las diez
                  columnas se reparten el ancho a ojo. Es posicional y va en el
                  mismo orden que los encabezados, por eso ANCHOS ya viene armado
                  según se muestre el contacto o no.
                  Nada de comentarios entre los <col>: adentro de un colgroup el
                  espacio en blanco es un nodo de texto y rompe la hidratación. */}
              <TableColgroup>
                {(verContacto ? ANCHOS.conContacto : ANCHOS.sinContacto).map((ancho, i) => (
                  <TableCol key={i} style={{ width: ancho }} />
                ))}
              </TableColgroup>
              {/* Todo a la izquierda, encabezado y celda igual: un encabezado
                  alineado distinto que su columna deja de leerse como su rótulo. */}
              <TableHeader className="sticky top-0 z-10 bg-[var(--ds-background-100)] [&_th]:font-bold">
                <TableRow>
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Apellido"
                      param="apellido"
                      opciones={opcionesApellido}
                      orden={{
                        param: "orden",
                        opciones: [
                          { valor: "az", label: "A a Z" },
                          { valor: "za", label: "Z a A" },
                        ],
                      }}
                    />
                  </TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Género" param="genero" opciones={opcionesGenero} />
                  </TableHead>
                  {/* Toda la tabla alinea a la izquierda, números incluidos: sin
                      `numeric` no hay text-right. Los dígitos siguen siendo
                      tabulares, eso va global sobre `table` en globals.css. */}
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Edad"
                      orden={{
                        param: "orden",
                        opciones: [
                          { valor: "edad-asc", label: "Menor" },
                          { valor: "edad-desc", label: "Mayor" },
                        ],
                      }}
                    />
                  </TableHead>
                  {/* Todavía no muestra nada: la columna está reservada y se
                      llena cuando se decida qué guarda. Va antes de Actividad
                      para que se lean juntas, lo planeado contra lo que pasó. */}
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Entrenamiento"
                      param="entrenamiento"
                      opciones={opcionesEntrenamiento}
                      orden={{
                        param: "orden",
                        opciones: [
                          { valor: "semana-vieja", label: "Más atrasada" },
                          { valor: "semana-nueva", label: "Más al día" },
                        ],
                      }}
                      rango={{ param: "semana", tipo: "date" }}
                    />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Actividad"
                      orden={{
                        param: "orden",
                        opciones: [
                          { valor: "act-reciente", label: "Más reciente" },
                          { valor: "act-antiguo", label: "Más antigua" },
                        ],
                      }}
                      rango={{ param: "actividad", tipo: "date" }}
                    />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Vencimiento"
                      orden={{
                        param: "orden",
                        opciones: [
                          { valor: "vence-cerca", label: "Vence antes" },
                          { valor: "vence-lejos", label: "Vence después" },
                        ],
                      }}
                      rango={{ param: "vence", tipo: "date" }}
                    />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna etiqueta="Estado" param="estado" opciones={opcionesEstado} />
                  </TableHead>
                  <TableHead>
                    <FiltroColumna
                      etiqueta="Balance"
                      orden={{
                        param: "orden",
                        opciones: [
                          { valor: "debe", label: "Más deuda" },
                          { valor: "favor", label: "Más a favor" },
                        ],
                      }}
                      monto={{ param: "saldo" }}
                    />
                  </TableHead>
                  {verContacto && (
                    <>
                      <TableHead>Número</TableHead>
                      <TableHead>Mail</TableHead>
                    </>
                  )}
                  <TableHead className="text-center" />
                </TableRow>
              </TableHeader>
              {/* Rayado y no `bordered`: con diez columnas, la banda de color
                  sostiene el renglón mucho mejor que una línea abajo. */}
              <TableBody
                striped
                className="[&_tr]:transition-colors [&_tr:hover]:bg-[var(--ds-gray-200)]"
              >
                {visibles.map((a) => (
                  <TableRow key={a.id}>
                    {/* Los dos son el nombre de la persona: mismo color. El peso
                        alcanza para que el apellido, que es por donde se ordena,
                        siga siendo el ancla de la fila.
                        El enlace a la ficha va acá y no en toda la fila: la fila
                        ya tiene mailto, tel y Editar, y un <a> no puede envolver
                        a otro. La identidad es lo que uno aprieta igual. */}
                    <TableCell className="font-medium text-[var(--ds-gray-1000)]">
                      <Link href={`/alumnos/${a.id}`} className="hover:underline">
                        {a.apellido}
                      </Link>
                    </TableCell>
                    <TableCell className="text-[var(--ds-gray-1000)]">
                      <Link href={`/alumnos/${a.id}`} className="hover:underline">
                        {a.nombre}
                      </Link>
                    </TableCell>

                    <TableCell>{a.genero ? GENERO[a.genero] : vacio}</TableCell>
                    <TableCell>{a.edad ?? vacio}</TableCell>

                    {/* La fecha —o el "Revisar"— linkea a la planilla del alumno:
                        desde el listado se entra a la rutina de un clic, que es
                        para lo que se mira esta columna. */}
                    <TableCell>
                      <Entrenamiento
                        sheetId={a.sheet_id}
                        semana={a.rutina_semana}
                        estado={a.rutina_estado}
                      />
                    </TableCell>

                    <TableCell>
                      {a.ultima_actividad ? (
                        // La fecha exacta y la hora local salen al pasar el mouse.
                        <RelativeTimeCard date={a.ultima_actividad} side="top">
                          <span className={dormido(a) ? "text-[var(--ds-amber-900)]" : undefined}>
                            {haceCuanto(a.ultima_actividad)}
                          </span>
                        </RelativeTimeCard>
                      ) : (
                        <span className="text-[var(--ds-gray-900)]">Nunca</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {a.vence === null ? (
                        vacio
                      ) : vencido(a) ? (
                        <Badge variant="red">Venció {fechaCorta(a.vence, "2-digit")}</Badge>
                      ) : (
                        <Badge variant="green">Hasta {fechaCorta(a.vence, "2-digit")}</Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant={ESTADO_COLOR[estadoDe(a)]}>{estadoDe(a)}</Badge>
                    </TableCell>

                    {/* En la base `saldo > 0` es lo que el alumno DEBE: para el que
                        mira la tabla eso es estar en rojo, y tener a favor, en verde. */}
                    <TableCell>
                      {a.saldo > 0 ? (
                        <span className="text-[var(--ds-red-900)]">−{pesos(a.saldo)}</span>
                      ) : a.saldo < 0 ? (
                        <span className="text-[var(--ds-green-900)]">+{pesos(-a.saldo)}</span>
                      ) : (
                        vacio
                      )}
                    </TableCell>

                    {/* Contacto clickeable: desde el mostrador se llama o se escribe. */}
                    {verContacto && (
                      <>
                        <TableCell>
                          {a.celular ? (
                            <a
                              href={`tel:${a.celular.replace(/\s/g, "")}`}
                              className="hover:text-[var(--ds-gray-1000)] hover:underline"
                            >
                              {a.celular}
                            </a>
                          ) : (
                            vacio
                          )}
                        </TableCell>
                        <TableCell>
                          {a.email ? (
                            <a
                              href={`mailto:${a.email}`}
                              className="hover:text-[var(--ds-gray-1000)] hover:underline"
                            >
                              {a.email}
                            </a>
                          ) : (
                            vacio
                          )}
                        </TableCell>
                      </>
                    )}

                    <TableCell className="text-center">
                      <AlumnoModal
                        alumno={{
                          id: a.id,
                          apellido: a.apellido,
                          nombre: a.nombre,
                          nacimiento: a.nacimiento,
                          genero: a.genero,
                          celular: a.celular,
                          email: a.email,
                          vence: a.vence,
                          activo: a.activo,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                <MostrarMas
                  ruta="/alumnos"
                  params={params}
                  tope={tope}
                  enPagina={visibles.length}
                  total={lista.length}
                  columnas={verContacto ? 12 : 10}
                />
              </TableBody>
            </Table>
          </TableRoot>

        </div>
      )}
    </div>
  );
}
