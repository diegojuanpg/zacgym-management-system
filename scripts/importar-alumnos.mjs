/**
 * Arma el listado de alumnos cruzando el Google Sheets con el pipeline.
 *
 *   node scripts/importar-alumnos.mjs "Hoja Madre - Control de usuarios.csv" \
 *     --tracking tracking.json --sql alumnos.sql --reporte reporte.txt
 *
 * El sheet manda para apellido y nombre: es el unico que los tiene separados
 * ("Apellido, Nombre"). El pipeline manda para mail, telefono y vencimiento.
 * El cruce se guarda en alumnos.tracking_id y de ahi en mas la vista lee el
 * vencimiento en vivo, sin copiarlo.
 *
 * Es idempotente: el insert va con on conflict (apellido, nombre) do update.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { corregir, limpiar } from "./acentos.mjs";

const [csvPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flag = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? def : process.argv[i + 1];
};
if (!csvPath) throw new Error("falta el CSV: node scripts/importar-alumnos.mjs <archivo.csv>");

// --- CSV ------------------------------------------------------------------

/** Parser minimo: comillas dobles con "" adentro, saltos de linea dentro de celda. */
function parseCsv(texto) {
  const filas = [];
  let fila = [], celda = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false;
      } else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(celda); celda = ""; }
    else if (c === "\n") { fila.push(celda); filas.push(fila); fila = []; celda = ""; }
    else if (c !== "\r") celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

const sinAcentos = (s) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tokens = (s) => sinAcentos(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const claveNombre = (s) => tokens(s).sort().join(" ");

const filas = parseCsv(readFileSync(csvPath, "utf8"));
// La fila 6 (indice 5) son los encabezados; arriba hay titulos combinados.
const CRUDAS = filas.slice(6).filter((f) => f[1]?.trim());

const reporte = { sinComa: [], fusionados: [], sinMatch: [], ambiguos: [], sheetIdRepetido: [] };

/** La hoja tiene celdas de error de Apps Script donde deberia haber un mail. */
const esMail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

// --- alumnos del sheet ----------------------------------------------------

const porClave = new Map();
for (const f of CRUDAS) {
  const completo = limpiar(f[1].trim());
  const coma = completo.indexOf(",");
  if (coma === -1) {
    // Sin coma no hay forma de saber que parte es el apellido. Algunas son
    // basura de la hoja ("S9", "Rutina???"), otras son gente a la que se le
    // olvido la coma: si tiene membresia entra igual por el lado del pipeline.
    reporte.sinComa.push(completo);
    continue;
  }
  // La hoja perdio la mitad de las tildes: se ponen al entrar, no despues.
  const apellido = corregir(completo.slice(0, coma).trim());
  const nombre = corregir(completo.slice(coma + 1).trim());
  if (!apellido || !nombre) { reporte.sinComa.push(completo); continue; }

  const clave = claveNombre(completo);
  const previo = porClave.get(clave);
  const al = {
    apellido, nombre,
    sheet_id: f[0]?.trim() || null,
    email: esMail((f[20] ?? "").trim().toLowerCase()) ? f[20].trim().toLowerCase() : null,
    tracking_id: null,
  };
  if (!previo) { porClave.set(clave, al); continue; }

  // Duplicado por acento ("Ibañez, Carina" / "Ibáñez, Carina"): se queda la
  // version acentuada, que es la bien escrita, y se completa lo que falte.
  reporte.fusionados.push(`${previo.apellido}, ${previo.nombre}  +  ${apellido}, ${nombre}`);
  const acentuado = /[^\x00-\x7F]/.test(apellido + nombre);
  if (acentuado) { previo.apellido = apellido; previo.nombre = nombre; }
  previo.sheet_id ??= al.sheet_id;
  previo.email ??= al.email;
}

// El mismo sheet_id es el mismo alumno escrito dos veces, casi siempre con el
// apellido mal tipeado ("Bartolucci" / "Bartoluccli"). Se fusionan solo si los
// nombres comparten alguna palabra: hay un id que la hoja le puso a dos personas
// distintas, y ese no se puede fusionar sin perder una.
const duenoDelId = new Map();
for (const [clave, a] of [...porClave]) {
  if (!a.sheet_id) continue;
  const dueno = duenoDelId.get(a.sheet_id);
  if (!dueno) { duenoDelId.set(a.sheet_id, a); continue; }

  const suyas = new Set(tokens(`${a.apellido} ${a.nombre}`));
  const comparte = tokens(`${dueno.apellido} ${dueno.nombre}`).some((t) => suyas.has(t));
  if (!comparte) {
    reporte.sheetIdRepetido.push(
      `${dueno.apellido}, ${dueno.nombre}  y  ${a.apellido}, ${a.nombre} comparten sheet_id: se lo queda el primero`,
    );
    a.sheet_id = null;
    continue;
  }
  reporte.fusionados.push(`${dueno.apellido}, ${dueno.nombre}  +  ${a.apellido}, ${a.nombre}`);
  const acentuado = /[^\x00-\x7F]/.test(a.apellido + a.nombre);
  if (acentuado) { dueno.apellido = a.apellido; dueno.nombre = a.nombre; }
  dueno.email ??= a.email;
  porClave.delete(clave);
}

// --- pipeline -------------------------------------------------------------

async function traerTracking() {
  const archivo = flag("tracking");
  if (archivo) return JSON.parse(readFileSync(archivo, "utf8"));
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) throw new Error("pasa --tracking <archivo.json> o carga .env");
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select id, nombre, gmail, sheet_id, vencimiento from public.alumnos_tracking" }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Del mas nuevo al mas viejo: si dos filas del pipeline caen en el mismo
// alumno (cuenta vieja y cuenta nueva), el vinculo se lo queda la vigente.
const tracking = (await traerTracking()).sort((a, b) =>
  String(b.vencimiento ?? "").localeCompare(String(a.vencimiento ?? "")),
);

const porSheetId = new Map(), porMail = new Map(), porNombre = new Map();
for (const a of porClave.values()) {
  if (a.sheet_id) porSheetId.set(a.sheet_id, a);
  if (a.email && !porMail.has(a.email)) porMail.set(a.email, a);
}
for (const [clave, a] of porClave) porNombre.set(clave, a);

for (const t of tracking) {
  const mail = (t.gmail ?? "").trim().toLowerCase();
  const destino =
    (t.sheet_id && porSheetId.get(t.sheet_id)) ||
    (mail && porMail.get(mail)) ||
    porNombre.get(claveNombre(t.nombre));

  if (!destino) {
    // No esta en el sheet: se crea desde el pipeline. El apellido se adivina
    // con el ultimo token, que es lo unico que se puede hacer con "Nombre Apellido".
    const ts = corregir((t.nombre ?? "").trim()).split(/\s+/);
    const apellido = ts.pop() ?? "";
    const nombre = ts.join(" ") || apellido;
    reporte.sinMatch.push(`${t.nombre}  ->  ${apellido}, ${nombre}`);
    porClave.set(`pipeline:${t.id}`, {
      apellido, nombre, sheet_id: t.sheet_id || null,
      email: mail || null, tracking_id: t.id,
    });
    continue;
  }
  if (destino.tracking_id) {
    // Dos filas del pipeline caen en el mismo alumno: se queda la primera.
    reporte.ambiguos.push(`${t.nombre} (${mail}) vence ${String(t.vencimiento).slice(0, 10)} — se quedo la fila mas nueva`);
    continue;
  }
  destino.tracking_id = t.id;
  destino.email ??= mail || null;
}

// --- salida ---------------------------------------------------------------

const q = (v) => (v === null || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const alumnos = [...porClave.values()];

const partes = [
  "-- Generado por scripts/importar-alumnos.mjs. No editar a mano.",
  "begin;",
];
for (let i = 0; i < alumnos.length; i += 200) {
  const chunk = alumnos.slice(i, i + 200).map(
    (a) => `  (${q(a.apellido)}, ${q(a.nombre)}, ${q(a.email)}, ${q(a.sheet_id)}, ${q(a.tracking_id)}, ${a.tracking_id ? "true" : "false"})`,
  );
  partes.push(
    "insert into public.alumnos (apellido, nombre, email, sheet_id, tracking_id, activo) values",
    chunk.join(",\n"),
    `on conflict (apellido, nombre) do update set
   email = coalesce(public.alumnos.email, excluded.email),
   sheet_id = coalesce(excluded.sheet_id, public.alumnos.sheet_id),
   tracking_id = coalesce(excluded.tracking_id, public.alumnos.tracking_id),
   activo = public.alumnos.activo or excluded.activo;`,
  );
}
partes.push("commit;");
writeFileSync(flag("sql", "alumnos.sql"), partes.join("\n") + "\n");

const conTracking = alumnos.filter((a) => a.tracking_id).length;
const linea = (t, xs) => `\n## ${t} (${xs.length})\n` + (xs.length ? xs.map((x) => "  " + x).join("\n") : "  ninguno") + "\n";
writeFileSync(
  flag("reporte", "reporte-import.txt"),
  `Importacion de alumnos — ${new Date().toISOString().slice(0, 10)}

Filas del sheet leidas: ${CRUDAS.length}
Alumnos a insertar:     ${alumnos.length}
  con datos del pipeline: ${conTracking}
  solo del sheet:         ${alumnos.length - conTracking}
Filas del pipeline:     ${tracking.length}
` +
    linea("Salteados: sin coma, no se sabe cual es el apellido", reporte.sinComa) +
    linea("Fusionados: el mismo alumno escrito dos veces (acentos)", reporte.fusionados) +
    linea("Creados desde el pipeline: no estaban en el sheet", reporte.sinMatch) +
    linea("Descartados: dos filas del pipeline para el mismo alumno", reporte.ambiguos) +
    linea("Un sheet_id para dos personas distintas", reporte.sheetIdRepetido),
);

console.error(
  `${alumnos.length} alumnos (${conTracking} con pipeline) · ` +
    `salteados ${reporte.sinComa.length} · fusionados ${reporte.fusionados.length} · ` +
    `nuevos del pipeline ${reporte.sinMatch.length} · descartados ${reporte.ambiguos.length}`,
);
