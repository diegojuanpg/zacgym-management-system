import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Buscador } from "@/components/buscador";
import { TabsUrl } from "@/components/tabs-url";
import { ToggleUrl } from "@/components/toggle-url";
import { FiltroColumna } from "@/components/filtro-columna";
import { MostrarMas, recortar } from "@/components/mostrar-mas";
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
import { rangoDe, comparador } from "@/lib/filtros";
import { traerTodo } from "@/lib/traer-todo";

const ZONA = "America/Argentina/Buenos_Aires";

const ESTADO_COLOR = {
  Activo: "blue",
  Vencido: "amber",
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

/** Apellido, nombre, género, edad, estado, actividad, vencimiento, balance [, mail, número], acciones. */
const ANCHOS = {
  conContacto: ["10%", "11%", "8%", "5%", "8%", "9%", "10%", "8%", "14%", "10%", "7%"],
  sinContacto: ["13%", "15%", "11%", "7%", "10%", "12%", "13%", "12%", "7%"],
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

interface FilaAlumno {
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
}

export default async function AlumnosPage({ searchParams }: PageProps<"/alumnos">) {
  const params = await searchParams;
  const { q, ver, orden, apellido, estado, genero, contacto, filas, vence, actividad, saldo } =
    params;
  const busqueda = typeof q === "string" ? q.trim() : "";
  // El contacto viene oculto: son dos columnas que casi nunca se miran y que
  // corren el resto de la tabla fuera de la pantalla. Se pide con ?contacto=si.
  const verContacto = contacto === "si";
  const vista = typeof ver === "string" ? ver : "todos";
  const criterio = typeof orden === "string" ? orden : "";
  // Un filtro se manda como el mismo parámetro repetido: ?apellido=X&apellido=Y.
  const lista_ = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];

  const supabase = await createClient();
  // Son ~2000 alumnos y PostgREST corta si no se le pide de a tandas.
  const todos = await traerTodo<FilaAlumno>(
    supabase
      .from("alumnos_cuenta")
      .select(
        "id, apellido, nombre, celular, email, nacimiento, edad, genero, vence, saldo, activo, ultima_actividad",
      )
      .order("apellido")
      .order("nombre"),
  );
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
  const vencido = (a: FilaAlumno) => a.vence !== null && a.vence < hoy;
  const dormido = (a: FilaAlumno) => estaDormido(a.ultima_actividad);
  // Tres estados y no dos: "Activo" a secas junto a un vencimiento en rojo se
  // lee como una contradiccion. Inactivo es no estar en el padron; vencido es
  // estar pero deber la renovacion, que es a quien hay que ir a buscar.
  const estadoDe = (a: FilaAlumno) =>
    !a.activo ? "Inactivo" : vencido(a) ? "Vencido" : "Activo";
  const generoDe = (a: FilaAlumno) => (a.genero ? GENERO[a.genero] : "Sin especificar");

  const vistas = [
    { valor: "todos", nombre: "Todos", filtro: () => true },
    { valor: "vencidos", nombre: "Vencidos", filtro: vencido },
    { valor: "deudores", nombre: "Con deuda", filtro: (a: FilaAlumno) => a.saldo > 0 },
    { valor: "dormidos", nombre: "Sin actividad", filtro: dormido },
    { valor: "inactivos", nombre: "Inactivos", filtro: (a: FilaAlumno) => !a.activo },
  ].map((v) => ({ ...v, cuantos: todos.filter(v.filtro).length }));
  const vistaActual = vistas.find((v) => v.valor === vista) ?? vistas[0];

  const ordenar = (vs: string[]) => [...new Set(vs)].sort((a, b) => a.localeCompare(b, "es"));
  const opcionesApellido = ordenar(todos.map((a) => a.apellido));
  const opcionesEstado = ordenar(todos.map(estadoDe));
  const opcionesGenero = ordenar(todos.map(generoDe));

  const filtroApellido = lista_(apellido);
  const filtroEstado = lista_(estado);
  const filtroGenero = lista_(genero);
  // Los mismos filtros que en Ventas: un rango para las fechas y una
  // comparacion para la plata. El vencimiento ya viene como "2026-08-20", asi
  // que se compara como texto; la actividad es un instante y hay que pasarla a
  // dia de Buenos Aires antes.
  const rangoVence = rangoDe(vence);
  const rangoActividad = rangoDe(actividad);
  const filtroSaldo = comparador(saldo);
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });
  const texto = busqueda.toLowerCase();

  const lista = todos
    .filter(
      (a) =>
        vistaActual.filtro(a) &&
        (filtroApellido.length === 0 || filtroApellido.includes(a.apellido)) &&
        (filtroEstado.length === 0 || filtroEstado.includes(estadoDe(a))) &&
        (filtroGenero.length === 0 || filtroGenero.includes(generoDe(a))) &&
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
    <main className="flex flex-1 flex-col gap-4">
      {/* Los números que estaban en tres tarjetas ya los dicen las solapas de
          abajo. Acá queda solo lo que no repiten: cuántos hay y cuánto se debe. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-heading-20">Alumnos</h1>
        <p className="text-copy-14 text-[var(--ds-gray-900)]">
          {/* El título ya dice "Alumnos": repetirlo acá no agrega nada. */}
          {lista.length === todos.length
            ? `${todos.length} en total`
            : `${lista.length} de ${todos.length}`}
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Vistas guardadas, como cualquier CRM: cada una es una URL. El filtro
            se queda en el server: una función no cruza al cliente. */}
        {/* Contacto va pegado a las vistas y con la misma píldora: las dos cosas
            cambian qué muestra la tabla, aunque una elija filas y la otra columnas. */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsUrl
            param="ver"
            valor={vistaActual.valor}
            vistas={vistas.map(({ valor, nombre, cuantos }) => ({ valor, nombre, cuantos }))}
          />
          <ToggleUrl
            param="contacto"
            etiqueta="Contacto"
            encendido={verContacto}
            predeterminado={false}
          />
        </div>

        <div className="flex items-center gap-2">
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
                  <TableHead>
                    <FiltroColumna etiqueta="Estado" param="estado" opciones={opcionesEstado} />
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
                      <TableHead>Mail</TableHead>
                      <TableHead>Número</TableHead>
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

                    <TableCell>
                      <Badge variant={ESTADO_COLOR[estadoDe(a)]}>{estadoDe(a)}</Badge>
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
                  columnas={verContacto ? 11 : 9}
                />
              </TableBody>
            </Table>
          </TableRoot>

        </div>
      )}
    </main>
  );
}
