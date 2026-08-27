/**
 * ZAC GYM - Listado de plan por alumno (desde hoja "Pagos" de cada planilla).
 *
 * Recorre Control de usuarios (A7:A = sheet_id, M = fecha semana entrenamiento,
 * U = gmail). Filtra por M dentro de las ultimas 4 semanas. Para los que pasan,
 * abre su planilla, hoja "Pagos", rango D3:D, y toma el valor mas reciente
 * (el mas abajo que no sea "-" ni vacio) como PLAN.
 *
 * Salida: CSV en Drive con columnas: sheet_id, gmail, plan, error.
 *   - fila OK      -> plan lleno, error vacio
 *   - fila con problema -> plan vacio, error con el motivo
 *   - M vieja (fuera de 4 semanas) -> NO entra al CSV
 *
 * Corre en Apps Script (limite 6 min): procesa por tandas, guarda progreso y
 * auto-continua con un trigger cada ~60s. Acumula en la pestaña "ListadoPlan"
 * del Control, y al terminar arma el archivo CSV en Drive (URL en el Log).
 *
 * USO:
 *   generarListadoPlan()   -> arranca de cero (limpia y procesa; auto-continua).
 *   procesarListadoPlan()  -> continua desde donde quedo (lo llama el trigger;
 *                             tambien podes correrlo a mano).
 */

const LP = {
  CONTROL_ID: '1AJ7rleF-zHcBpKnV5UPbQe04ZABQOw3Kk8UOuxy9ryg',
  CONTROL_TAB: 'Control de usuarios',
  OUT_TAB: 'ListadoPlan',
  COL_SHEETID: 1,    // A
  COL_FECHA_M: 13,   // M
  COL_GMAIL: 21,     // U
  DATA_START_ROW: 7,
  PAGOS_TAB: 'Pagos',
  PAGOS_COL: 4,      // D
  PAGOS_START_ROW: 3,
  WEEKS_BACK: 4,     // ventana: hoy - 4*7 dias
  MAX_RUNTIME_MS: 5 * 60 * 1000,   // corta antes del limite duro de 6 min
  RETRASO_TRIGGER_MS: 60 * 1000,   // espera antes de continuar
  TZ: 'America/Argentina/Buenos_Aires',
};
const PROP_LP_ROW = 'LP_NEXT_ROW';

// ---------- Entradas ----------

function generarListadoPlan() {
  borrarTriggersLP_();
  const out = getOutTab_();
  out.clear();
  out.getRange(1, 1, 1, 4).setValues([['sheet_id', 'gmail', 'plan', 'error']]);
  PropertiesService.getScriptProperties().setProperty(PROP_LP_ROW, String(LP.DATA_START_ROW));
  procesarListadoPlan();
}

function procesarListadoPlan() {
  const props = PropertiesService.getScriptProperties();
  const start = Date.now();

  const control = SpreadsheetApp.openById(LP.CONTROL_ID).getSheetByName(LP.CONTROL_TAB);
  if (!control) throw new Error('No existe la hoja "' + LP.CONTROL_TAB + '".');
  const lastRow = control.getLastRow();
  const out = getOutTab_();

  // umbral = medianoche de (hoy - 4 semanas). M >= umbral entra; futuras cuentan.
  const umbral = new Date();
  umbral.setHours(0, 0, 0, 0);
  umbral.setDate(umbral.getDate() - LP.WEEKS_BACK * 7);

  let row = parseInt(props.getProperty(PROP_LP_ROW) || String(LP.DATA_START_ROW), 10);
  const n = lastRow - row + 1;
  if (n <= 0) { finalizarLP_(out); return; }

  const vals = control.getRange(row, 1, n, LP.COL_GMAIL).getValues(); // A..U

  const buffer = [];
  let i = 0;
  for (; i < vals.length; i++) {
    if (Date.now() - start > LP.MAX_RUNTIME_MS) break;
    const r = vals[i];
    const sheetId = String(r[LP.COL_SHEETID - 1] || '').trim();
    const gmail = String(r[LP.COL_GMAIL - 1] || '').trim();
    const fechaM = r[LP.COL_FECHA_M - 1];

    if (!sheetId) continue; // fila vacia

    const d = (fechaM instanceof Date) ? fechaM : null;
    if (!d || isNaN(d.getTime())) { buffer.push([sheetId, gmail, '', 'fecha M invalida']); continue; }
    if (d < umbral) continue; // fuera de las ultimas 4 semanas -> descartar

    try {
      const ss = SpreadsheetApp.openById(sheetId);
      const pagos = ss.getSheetByName(LP.PAGOS_TAB);
      if (!pagos) { buffer.push([sheetId, gmail, '', 'sin hoja Pagos']); continue; }
      const plan = ultimoPago_(pagos);
      if (!plan) buffer.push([sheetId, gmail, '', 'sin valor en Pagos']);
      else buffer.push([sheetId, gmail, plan, '']);
    } catch (e) {
      buffer.push([sheetId, gmail, '', 'no abre: ' + e.message]);
    }
  }

  if (buffer.length) out.getRange(out.getLastRow() + 1, 1, buffer.length, 4).setValues(buffer);

  const nextRow = row + i;
  if (nextRow > lastRow) {
    props.deleteProperty(PROP_LP_ROW);
    finalizarLP_(out);
  } else {
    props.setProperty(PROP_LP_ROW, String(nextRow));
    borrarTriggersLP_();
    ScriptApp.newTrigger('procesarListadoPlan').timeBased().after(LP.RETRASO_TRIGGER_MS).create();
    Logger.log('Corte por tiempo. Procesado hasta fila ' + (nextRow - 1)
      + '. Continua solo en ~' + (LP.RETRASO_TRIGGER_MS / 1000) + 's (o corre procesarListadoPlan a mano).');
  }
}

// ---------- Helpers ----------

/** Valor mas reciente de Pagos!D3:D = el mas abajo que no sea vacio ni "-". */
function ultimoPago_(pagos) {
  const last = pagos.getLastRow();
  if (last < LP.PAGOS_START_ROW) return '';
  const n = last - LP.PAGOS_START_ROW + 1;
  const col = pagos.getRange(LP.PAGOS_START_ROW, LP.PAGOS_COL, n, 1).getValues();
  for (let i = col.length - 1; i >= 0; i--) {
    const v = String(col[i][0] || '').trim();
    if (v && v !== '-') return v;
  }
  return '';
}

function finalizarLP_(out) {
  borrarTriggersLP_();
  const data = out.getDataRange().getValues();
  const csv = data.map(function (row) {
    return row.map(function (c) {
      const s = String(c == null ? '' : c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }).join('\n');
  const name = 'listado_plan_' + Utilities.formatDate(new Date(), LP.TZ, 'yyyyMMdd_HHmm') + '.csv';
  const file = DriveApp.createFile(name, csv, MimeType.CSV);
  Logger.log('LISTO. CSV: ' + file.getUrl() + '\nFilas (sin encabezado): ' + (data.length - 1));
}

function getOutTab_() {
  const ss = SpreadsheetApp.openById(LP.CONTROL_ID);
  return ss.getSheetByName(LP.OUT_TAB) || ss.insertSheet(LP.OUT_TAB);
}

function borrarTriggersLP_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesarListadoPlan') ScriptApp.deleteTrigger(t);
  });
}
