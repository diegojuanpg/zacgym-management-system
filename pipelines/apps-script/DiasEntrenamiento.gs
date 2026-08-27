/**
 * FASE 3 - Dias de entrenamiento.
 *
 * Para cada alumno con actividad en los ultimos 14 dias:
 *   1. busca su sheet_id en "Control de usuarios" (col A = sheet_id, col U = gmail)
 *   2. abre esa planilla, va a la hoja EntrenamientoX de numero mas alto
 *   3. cuenta cuantos dias distintos entrena (columna A), descartando filas
 *      ocultas a mano, con "-"/vacio, o que contengan "(Programa)"
 *   4. guarda en Supabase.dias_entrenamiento
 *
 * Optimizacion: saltea planillas que no cambiaron desde el ultimo calculo
 * (compara Drive modifiedTime con lo guardado). Asi la corrida diaria es barata.
 * Guard de tiempo: corta limpio a los 5 min; re-correr sigue con los pendientes.
 *
 * Ejecutar: syncDiasEntrenamiento  (la primera vez quiza haya que correrla
 * 2-3 veces hasta que el Log diga "pendientes: 0").
 */

const DIAS = {
  CONTROL_SPREADSHEET_ID: '1AJ7rleF-zHcBpKnV5UPbQe04ZABQOw3Kk8UOuxy9ryg',
  CONTROL_TAB: 'Control de usuarios',
  COL_SHEETID: 1,   // A
  COL_GMAIL: 21,    // U
  ACTIVITY_DAYS: 14,
  MAX_RUNTIME_MS: 5 * 60 * 1000, // corta antes del limite duro de 6 min
};

// deadline (opcional): timestamp absoluto en ms para cortar. Si no se pasa
// (corrida suelta), usa su propio tope de 5 min. Dentro de runDaily se le pasa
// un deadline que reserva tiempo para rebuildTracking.
function syncDiasEntrenamiento(deadline) {
  const runId = Utilities.getUuid();
  const limit = deadline || (Date.now() + DIAS.MAX_RUNTIME_MS);

  const control = loadControlMap_();            // email -> sheetId
  const activos = getActiveEmails_();           // emails con actividad <=14 dias
  const yaGuardado = loadDiasState_();          // email -> sheet_last_modified (ISO)

  let procesados = 0, saltados = 0, errores = 0, pendientes = 0, sinPlanilla = 0;

  for (let i = 0; i < activos.length; i++) {
    if (Date.now() > limit) {
      pendientes = activos.length - i;
      break;
    }
    const email = activos[i];
    try {
      const sheetId = control[email];
      if (!sheetId) {
        sinPlanilla++;
        log_(runId, 'dias', 'warn', 'sin sheet_id en Control de usuarios', { email: email });
        continue;
      }

      const driveMod = DriveApp.getFileById(sheetId).getLastUpdated();
      const prev = yaGuardado[email];
      if (prev && new Date(prev) >= driveMod) { saltados++; continue; } // no cambio

      const r = computeDias_(SpreadsheetApp.openById(sheetId));
      sbUpsert_('dias_entrenamiento', [{
        gmail: email,
        sheet_id: sheetId,
        entrenamiento_hoja: r.hoja,
        dias: r.dias,
        sheet_last_modified: driveMod.toISOString(),
        updated_at: new Date().toISOString(),
      }], 'gmail', 'merge');
      procesados++;
    } catch (e) {
      errores++;
      log_(runId, 'dias', 'error', e.message, { email: email });
    }
  }

  Logger.log('dias -> procesados: ' + procesados + ', saltados (sin cambio): ' + saltados
    + ', sin planilla: ' + sinPlanilla + ', errores: ' + errores + ', pendientes: ' + pendientes);
}

/**
 * Validador: proba UN alumno sin escribir en Supabase.
 * Cambia el email, corre esta funcion, mira el Log: hoja usada + dias contados.
 * Sirve para verificar que el conteo da bien antes de confiar en todas.
 */
function debugDiasUnAlumno() {
  const email = normEmail_('CAMBIAR_EMAIL_ACA@gmail.com');
  const control = loadControlMap_();
  const sheetId = control[email];
  if (!sheetId) { Logger.log('No hay sheet_id para ' + email + ' en Control de usuarios.'); return; }
  const ss = SpreadsheetApp.openById(sheetId);
  const r = computeDias_(ss);
  Logger.log('email: ' + email + '\nsheet_id: ' + sheetId
    + '\nhoja usada: ' + r.hoja + '\nDIAS contados: ' + r.dias);
}

// ---------- Control de usuarios: email -> sheetId ----------

function loadControlMap_() {
  const ss = SpreadsheetApp.openById(DIAS.CONTROL_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(DIAS.CONTROL_TAB);
  if (!sheet) throw new Error('No existe la hoja "' + DIAS.CONTROL_TAB + '".');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  const values = sheet.getRange(1, 1, lastRow, DIAS.COL_GMAIL).getValues();
  const map = {};
  values.forEach(function (row) {
    const sheetId = String(row[DIAS.COL_SHEETID - 1] || '').trim();
    const email = normEmail_(row[DIAS.COL_GMAIL - 1]);
    if (sheetId && email) map[email] = sheetId;
  });
  return map;
}

// ---------- Supabase: emails activos (<=14 dias) ----------

function getActiveEmails_() {
  const desde = new Date(Date.now() - DIAS.ACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = sbGet_('alumnos_tracking?select=gmail&gmail=not.is.null&ultimo_checkin=gte.'
    + encodeURIComponent(desde));
  const set = {};
  rows.forEach(function (r) { const e = normEmail_(r.gmail); if (e) set[e] = true; });
  return Object.keys(set);
}

function loadDiasState_() {
  const rows = sbGet_('dias_entrenamiento?select=gmail,sheet_last_modified');
  const map = {};
  rows.forEach(function (r) { map[normEmail_(r.gmail)] = r.sheet_last_modified; });
  return map;
}

// ---------- Contar dias en una planilla ----------

function computeDias_(spreadsheet) {
  const sheet = highestEntrenamientoSheet_(spreadsheet);
  if (!sheet) return { dias: null, hoja: null };

  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(3, sheet.getLastColumn());
  if (lastRow < 1) return { dias: 0, hoja: sheet.getName() };

  const headerRow = findHeaderRow_(sheet);
  const firstData = headerRow + 1;
  if (firstData > lastRow) return { dias: 0, hoja: sheet.getName() };

  const data = sheet.getRange(firstData, 1, lastRow - firstData + 1, lastCol).getValues();

  const diasSet = {};
  for (let i = 0; i < data.length; i++) {
    const dia = String(data[i][0] || '').trim();        // col A
    const ejercicio = String(data[i][2] || '').trim();  // col C
    if (!ejercicio || ejercicio === '-') continue;      // dia no programado / vacio
    if (ejercicio.indexOf('(Programa)') !== -1) continue; // regla: excluir (Programa)
    if (!dia) continue;
    if (diasSet[normText_(dia)]) continue;              // ese dia ya conto, no re-chequear
    if (sheet.isRowHiddenByUser(firstData + i)) continue; // ocultas a mano (solo filas candidatas)
    diasSet[normText_(dia)] = true;
  }
  return { dias: Object.keys(diasSet).length, hoja: sheet.getName() };
}

/** Hoja "EntrenamientoX" de numero mas alto (X entero pegado; sin numero = base). */
function highestEntrenamientoSheet_(spreadsheet) {
  let best = null, bestN = -1;
  spreadsheet.getSheets().forEach(function (s) {
    const m = /^Entrenamiento(\d*)$/.exec(s.getName().trim());
    if (!m) return;
    const n = m[1] === '' ? 0 : parseInt(m[1], 10);
    if (n > bestN) { bestN = n; best = s; }
  });
  return best;
}

/** Fila del encabezado (col A = "DIA"/"DÍA"). Si no aparece, asume 0 (datos desde fila 1). */
function findHeaderRow_(sheet) {
  const n = Math.min(30, sheet.getLastRow());
  if (n < 1) return 0;
  const colA = sheet.getRange(1, 1, n, 1).getValues();
  for (let i = 0; i < colA.length; i++) {
    if (normText_(String(colA[i][0] || '')) === 'dia') return i + 1;
  }
  return 0;
}

// ---------- Normalizacion ----------

function normText_(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}
function normEmail_(s) {
  return String(s || '').trim().toLowerCase();
}
