// Genera el SQL para cargar el historico de ventas de la planilla "Hoja Madre -
// Novedades" en la base. Es de una sola vez: el CSV esta gitignoreado y el SQL
// que sale tambien tiene nombres de alumnos, asi que ninguno de los dos entra al
// repo. Lo que se versiona es esto, que sin el CSV no dice nada de nadie.
//
//   node scripts/importar-hoja-madre.mjs "Hoja Madre - Novedades.csv" <carpeta>
//
// Escribe cinco archivos numerados para correr en orden. Van separados a
// proposito: entre el 2 y el 4 esta el 3, que muestra lo que no resolvio, y esa
// es la unica oportunidad de frenar antes de escribir 5657 ventas.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [csvPath, salida] = process.argv.slice(2);
if (!csvPath || !salida) {
  console.error('uso: node scripts/importar-hoja-madre.mjs "<csv>" <carpeta>');
  process.exit(1);
}

/** CSV con comillas: un campo entrecomillado puede tener comas y comillas dobladas. */
function parsearCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') entreComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

const sinTildes = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// ============================== productos ==============================

/** Los 18 que estan cargados hoy. Lo que caiga acá no se crea. */
const CATALOGO = [
  "Agua 600ml", "Asesoria VIP", "Cuota", "Cuota 25% OFF", "Cuota 50% OFF", "Cuota Online",
  "Dia", "Monster", "Pase Bronce", "Pase Oro", "Pase Plata", "Promo Fliar x3",
  "Promo Fliar x4", "Promo Fliar x5", "Que lo paleo BLANCA", "Que lo paleo NEGRA",
  "Quincena", "Semana",
];
const porCatalogo = new Map(CATALOGO.map((n) => [sinTildes(n), n]));

/** Lo que la planilla escribe distinto y es un producto que ya existe. */
const ALIAS_PRODUCTO = new Map(Object.entries({
  "50% off": "Cuota 50% OFF",
  "medio mes": "Quincena",
  "1 semana": "Semana",
  "bronce": "Pase Bronce",
  "online": "Cuota Online",
  "cuota online deuda": "Cuota Online",
  "promo fliarx3": "Promo Fliar x3",
  "agua 600 ml": "Agua 600ml",
  // Todas las Monster van a Monster: la planilla separaba el sabor blanco.
  "monster blanca": "Monster",
}));

/** Ni se importan ni se crean: no eran ventas. */
const PRODUCTO_AFUERA = new Set(
  ["BALANZA", "Medias x1 par", "Medias x3 par", "Rifa Clemente", "?"].map(sinTildes),
);

/** El comentario que la planilla pega entre parentesis no es parte del nombre. */
function limpiarProducto(bruto) {
  const base = bruto.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
  const clave = sinTildes(base);
  return ALIAS_PRODUCTO.get(clave) ?? porCatalogo.get(clave) ?? base;
}

const SUPLEMENTO = /(whey|doy pack|creatina|pump|tnt|cafe[ií]na|just plant|shaker|botella)/i;
const CONSUMIBLE = /(monster|que lo paleo|zanna|barrita|casta|almendra|nuec|mix |pasta de mani|aceite de coco|miel|calor)/i;

/** Los historicos entran con la misma convencion que el catalogo de hoy. */
function clasificar(nombre) {
  if (SUPLEMENTO.test(nombre)) return { categoria: "suplemento", caja: "grande" };
  if (CONSUMIBLE.test(nombre)) return { categoria: "consumible", caja: "chica" };
  return { categoria: "mensualidad", caja: "grande" };
}

// ============================== alumnos ==============================

/** Tipeos de la planilla, uno por uno, confirmados contra el listado. */
const ALIAS_ALUMNO = new Map(Object.entries({
  "porcel rulli, sole ♥": "Porcel Rulli, Sole",
  "d'andrea dolores": "D'Andrea, Dolores",
  "castro martinez, saracho": "Castro Martínez Saracho, Juan Martín",
  "obrist roxana": "Obrist, Roxana",
  "chaves, jacqueline": "Chaves Mahamed, Jacqueline",
  "chavez, jaqueline": "Chaves Mahamed, Jacqueline",
  "antelo bravo, zoe ❤": "Antelo Bravo, Zoe",
  "antelo bravo, zoe ❤ rutina": "Antelo Bravo, Zoe",
  "nougues, ignacio": "Nogués, Ignacio",
  "peiro, emiliano": "Peiro Balbo, Emiliano",
  "masnueto lara": "Mansueto, Lara",
  "ignacio, lefort": "Le Fort, Ignacio",
  "szlosberg, sergio, sergio": "Szlosberg, Sergio",
  "di llulo, andres": "Di Lullo, Andrés",
  "carruso, eugenia": "Caruso, Eugenia",
  "bazan, juan": "Bazan, Juan Cruz",
  "belmonte, juan": "Belmonte, Juan Cruz",
  "heguy, maria mercedez": "Heguy, María Mercedes",
  "anonella caponetto": "Caponetto, Antonella",
  "schujman, nicolas": "Schujman, Nicolás José",
  "emiliano, koch": "Koch, Emiliano",
  "gonzalez, javier": "González, René Javier",
  "plaaete, beatriz": "Plaate, Beatriz",
  "aguiare, luciana": "Aguiar, Luciana",
  "maria agustina, mascaro": "Mascaró, María Agustina",
  "sanchez, benjamin": "Sánchez Ferran, Benjamín",
  "llanos, guadalupe": "Llanos Runco, Guadalupe",
  "llanos, julieta": "Llanos Runco, Julieta",
  "emilia suarez": "Suárez, Emilia",
  "gerineau, rafa": "Guerineau, Rafael",
  "almeida, ezequiel jose": "Almedia, Ezequiel José",
  "constantino, rosatti": "Rosati, Constantino",
  "coloti, cesar": "Colotti, César",
  "d’andrea, maria melinda": "D'Andrea, María Melinda",
  "tartalini, agustin": "Tartarini, Agustín",
  "valdez, maximo": "Valdez Sitarski, Máximo",
  "fioreti, cesar": "Fioretti, César",
  "marchese, nahuel": "Marchesi, Nahuel",
  "villagra, guadalupe": "Villagra Ahado, Guadalupe",
  "zerda, segundo": "Zerda, Segundo Octavio",
  "rotger, luciana maria ($250 a favor)": "Rotger, Luciana María",
  "guzman villareal, santiago": "Guzmán Villarreal, Santiago",
  "magro, nicolas": "Magro, Ángel Nicolás",
  "alloli, lucia": "Allori Vallejo, Lucía",
  "arguelles, juan pablo": "Arguelles, Leandro",
  "frias, matias": "Frías Agüero, Matías Ariel",
}));

/** No son nadie: se van con sus filas. */
const ALUMNO_AFUERA = new Set(
  ["Pasteris, Virginia", "Sale, Samuel", "?", "???", "Retiré por mal estado"].map(sinTildes),
);

// ============================== metodo ==============================

/**
 * La planilla escribe el metodo a mano. Los errores de tipeo se normalizan; los
 * que hablan de un saldo a favor o no dicen nada entran como "no paga", que es
 * justamente "salio del mostrador y no entro plata".
 */
function resolverMetodo(bruto, hayTotal) {
  const m = sinTildes(bruto);
  if (!hayTotal) return "no_paga";
  if (m.startsWith("debe")) return "debe";
  if (m.startsWith("efect") || m.startsWith("efectico") || m.startsWith("pagado")) return "efectivo";
  if (m.startsWith("transferencia") || m.startsWith("tranferencia")) return "transferencia";
  return "no_paga";
}

// ============================== lectura ==============================

const filas = parsearCSV(readFileSync(csvPath, "utf8"))
  .slice(2)
  .filter((f) => f.some((c) => c.trim() !== ""));

const aPesos = (v) => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const aFecha = (v) => {
  const [f, h] = v.trim().split(" ");
  const [d, m, a] = f.split("/");
  // Argentina no cambia de hora: el -03:00 fijo alcanza.
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${h}-03:00`;
};

// Primera pasada: el precio de cada producto por epoca. Lo que la planilla dejo
// sin total se carga con el precio que ese producto tenia ahi, no con el de hoy.
const vistos = new Map();
for (const f of filas) {
  const total = aPesos(f[5]);
  if (total === null) continue;
  const cantidad = Number(f[3]) >= 1 ? Number(f[3]) : 1;
  const nombre = limpiarProducto(f[2]);
  if (!vistos.has(nombre)) vistos.set(nombre, new Map());
  const cuenta = vistos.get(nombre);
  const unitario = total / cantidad;
  cuenta.set(unitario, (cuenta.get(unitario) ?? 0) + 1);
}
const precioTipico = new Map(
  [...vistos].map(([nombre, cuenta]) => [
    nombre,
    [...cuenta].sort((a, b) => b[1] - a[1])[0][0],
  ]),
);

const ventas = [];
const nuevos = new Map();
const descartadas = { producto: 0, alumno: 0, sinPrecio: 0 };

for (const f of filas) {
  const producto = limpiarProducto(f[2]);
  if (PRODUCTO_AFUERA.has(sinTildes(producto))) { descartadas.producto++; continue; }

  const brutoAlumno = f[1].trim();
  if (ALUMNO_AFUERA.has(sinTildes(brutoAlumno))) { descartadas.alumno++; continue; }
  const alumno = ALIAS_ALUMNO.get(sinTildes(brutoAlumno)) ?? brutoAlumno;

  // La planilla a veces deja la cantidad en blanco o en "-". El total coincide
  // con una unidad, asi que va 1.
  const cantidad = Number(f[3]) >= 1 ? Number(f[3]) : 1;
  const total = aPesos(f[5]);
  const unitario = total === null ? precioTipico.get(producto) : total / cantidad;
  if (!unitario) { descartadas.sinPrecio++; continue; }

  if (!porCatalogo.has(sinTildes(producto)) && !nuevos.has(producto)) {
    nuevos.set(producto, { precio: Math.round(precioTipico.get(producto) ?? unitario), ...clasificar(producto) });
  }

  ventas.push({
    creado_en: aFecha(f[0]),
    alumno,
    producto,
    cantidad,
    precio: Math.round(unitario),
    metodo: resolverMetodo(f[4], total !== null),
  });
}

// ============================== escritura ==============================

const cita = (s) => `'${s.replace(/'/g, "''")}'`;
mkdirSync(salida, { recursive: true });
const escribir = (n, sql) => writeFileSync(join(salida, n), sql);

escribir("1-productos.sql", `-- Los productos que la planilla vendio y hoy no estan en el catalogo.
-- Entran inactivos: quedan para el historico y no aparecen al cargar una venta.
insert into productos (nombre, precio, caja, categoria, activo, stock, contar_en_turno)
values
${[...nuevos].map(([n, p]) => `  (${cita(n)}, ${p.precio}, '${p.caja}', '${p.categoria}', false, null, false)`).join(",\n")}
on conflict (nombre) do nothing;
`);

escribir("2-staging.sql", `-- La planilla escribe los nombres sin tildes y la base los tiene con tildes:
-- "Rodriguez, Nadia" contra "Rodríguez, Nadia". El join tiene que comparar por
-- esto y no por el texto crudo, o se pierde media importacion en silencio.
create or replace function public.import_norm(t text) returns text
language sql immutable as $sql$
  select lower(translate(t, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))
$sql$;

-- La planilla, ya resuelta, en una tabla de paso. No es temporal a proposito:
-- la carga va en varias vueltas y una temporary se muere entre una y otra.
drop table if exists public.import_novedades;
create table public.import_novedades (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null,
  alumno text not null,
  producto text not null,
  cantidad smallint not null,
  precio integer not null,
  metodo text not null
);
`);

// El insert va en tandas: por la API de management una sola sentencia con 5657
// filas no pasa.
const TANDA = 400;
const tandas = [];
for (let i = 0; i < ventas.length; i += TANDA) {
  const grupo = ventas.slice(i, i + TANDA);
  tandas.push(`insert into public.import_novedades (creado_en, alumno, producto, cantidad, precio, metodo) values
${grupo.map((v) => `  ('${v.creado_en}', ${cita(v.alumno)}, ${cita(v.producto)}, ${v.cantidad}, ${v.precio}, '${v.metodo}')`).join(",\n")};`);
}
escribir("2b-filas.sql", tandas.join("\n\n") + "\n");

escribir("3-verificar.sql", `-- Lo que no va a entrar. Tiene que dar cero filas las dos veces.
select 'alumno sin match' as problema, n.alumno as valor, count(*) as filas
  from public.import_novedades n
  left join public.alumnos a on public.import_norm(a.nombre_completo) = public.import_norm(n.alumno)
 where a.id is null
 group by n.alumno
union all
select 'producto sin match', n.producto, count(*)
  from public.import_novedades n
  left join public.productos p on public.import_norm(p.nombre) = public.import_norm(n.producto)
 where p.id is null
 group by n.producto
 order by 3 desc;
`);

escribir("4-cargar.sql", `-- El trigger de turno aborta si no hay uno abierto, y este historico no tiene
-- turno: se apaga mientras dura la carga.
alter table public.ventas disable trigger ventas_sella_turno;
alter table public.pagos disable trigger pagos_sella_turno;

-- El id de la venta sale de la tabla de paso, asi el pago sabe a cual colgarse.
insert into public.ventas (id, alumno_id, producto_id, cantidad, precio_unitario, creado_por, creado_en)
select n.id, a.id, p.id, n.cantidad, n.precio,
       (select id from auth.users order by created_at limit 1), n.creado_en
  from public.import_novedades n
  join public.alumnos a on public.import_norm(a.nombre_completo) = public.import_norm(n.alumno)
  join public.productos p on public.import_norm(p.nombre) = public.import_norm(n.producto);

-- Las DEBE no llevan pago: es justamente lo que quedo debiendo.
insert into public.pagos (venta_id, monto, metodo, creado_por, creado_en)
select n.id, n.cantidad * n.precio, n.metodo::metodo_pago,
       (select id from auth.users order by created_at limit 1), n.creado_en
  from public.import_novedades n
  join public.ventas v on v.id = n.id
 where n.metodo <> 'debe';

alter table public.ventas enable trigger ventas_sella_turno;
alter table public.pagos enable trigger pagos_sella_turno;
`);

escribir("5-limpiar.sql", `drop table if exists public.import_novedades;
drop function if exists public.import_norm(text);

-- Para deshacer todo: el historico es lo unico sin turno.
-- delete from public.pagos where venta_id in (select id from public.ventas where turno_id is null);
-- delete from public.ventas where turno_id is null;
`);

const deuda = ventas.filter((v) => v.metodo === "debe").reduce((s, v) => s + v.cantidad * v.precio, 0);
console.error(`ventas: ${ventas.length} | productos nuevos: ${nuevos.size} | tandas: ${tandas.length}`);
console.error(`descartadas -> producto: ${descartadas.producto}, alumno: ${descartadas.alumno}, sin precio: ${descartadas.sinPrecio}`);
console.error(`no paga: ${ventas.filter((v) => v.metodo === "no_paga").length} | debe: ${ventas.filter((v) => v.metodo === "debe").length} ($${deuda.toLocaleString("es-AR")})`);
