/**
 * ZAC GYM - Compartir / descompartir rutinas en masa (Apps Script).
 *
 * descompartirTodos()  -> quita acceso a TODOS los alumnos de Control de usuarios
 *                         (todos los sheet_id de A7:A). Deja solo al dueno (+ SH.KEEP).
 * compartirLista()     -> comparte a todos los de la pestania ShareList como EDITOR
 *                         con las 3 opciones de seguridad en false/desactivadas:
 *                           - writersCanShare = false  (editores no re-comparten)
 *                           - downloadRestrictions.restrictedForWriters = true
 *                             (editores Y lectores NO pueden descargar/imprimir/copiar)
 * probarDescompartirUno() / probarCompartirUno() -> prueban con 1 archivo (TEST_SHEET_ID).
 *
 * Usa Drive REST API v3 via UrlFetchApp + ScriptApp.getOAuthToken() (no hace falta
 * habilitar el servicio avanzado). DriveApp se usa para enumerar/quitar accesos.
 *
 * Ambas funciones masivas cortan antes de los 6 min, guardan progreso y auto-continuan
 * con un trigger cada ~60s. Errores -> pestania ShareLog.
 *
 * SEGURIDAD: descompartirTodos es DESTRUCTIVO (~1400 archivos). Corre primero con
 * DRY_RUN=true, mira el Log, y proba con probarDescompartirUno / probarCompartirUno.
 */

const SH = {
  CONTROL_ID: '1AJ7rleF-zHcBpKnV5UPbQe04ZABQOw3Kk8UOuxy9ryg',
  CONTROL_TAB: 'Control de usuarios',
  COL_SHEETID: 1,        // A en Control de usuarios
  DATA_START_ROW: 7,     // A7:A

  SHARE_TAB: 'ShareList', // pestania con la lista a compartir: A=sheet_id, B=gmail (desde fila 2)
  LOG_TAB: 'ShareLog',    // errores

  ROLE: 'writer',         // compartir como EDITOR (pedido). Los flags de abajo bloquean la copia igual.
  SEND_EMAIL: false,      // true = notifica al alumno al compartir
  EMAIL_MSG: '',          // mensaje del mail (solo si SEND_EMAIL true)

  KEEP: [],               // emails que NUNCA se descomparten (ademas del dueno). ej: ['profe@gmail.com']
  DRY_RUN: false,         // true = NO toca nada, solo loguea que haria

  MAX_RUNTIME_MS: 5 * 60 * 1000,
  RETRASO_TRIGGER_MS: 60 * 1000,
};
const PROP_DESC_ROW = 'SHARE_DESC_ROW';
const PROP_SHARE_ROW = 'SHARE_SHARE_ROW';

// Para las funciones de prueba (editar):
const TEST_SHEET_ID = 'PEGAR_SHEET_ID_ACA';
const TEST_EMAIL = 'alumno@gmail.com';

// ============================================================
// DESCOMPARTIR TODOS
// ============================================================

function descompartirTodos() {
  borrarTrig_('continuarDescompartir');
  PropertiesService.getScriptProperties().setProperty(PROP_DESC_ROW, String(SH.DATA_START_ROW));
  continuarDescompartir();
}

function continuarDescompartir() {
  const props = PropertiesService.getScriptProperties();
  const start = Date.now();
  const ctrl = SpreadsheetApp.openById(SH.CONTROL_ID).getSheetByName(SH.CONTROL_TAB);
  if (!ctrl) throw new Error('No existe la hoja "' + SH.CONTROL_TAB + '".');
  const lastRow = ctrl.getLastRow();
  const keep = keepSet_();

  let row = parseInt(props.getProperty(PROP_DESC_ROW) || String(SH.DATA_START_ROW), 10);
  const n = lastRow - row + 1;
  if (n <= 0) { props.deleteProperty(PROP_DESC_ROW); Logger.log('DESCOMPARTIR: nada que hacer.'); return; }

  const ids = ctrl.getRange(row, SH.COL_SHEETID, n, 1).getValues();
  let archivos = 0, quitados = 0, errores = 0, i = 0;
  for (; i < ids.length; i++) {
    if (Date.now() - start > SH.MAX_RUNTIME_MS) break;
    const sid = String(ids[i][0] || '').trim();
    if (!sid) continue;
    try { quitados += descompartirArchivo_(sid, keep); archivos++; }
    catch (e) { errores++; logErr_(sid, 'descompartir', e.message); }
  }

  const nextRow = row + i;
  Logger.log((SH.DRY_RUN ? '[DRY] ' : '') + 'descompartir: archivos ' + archivos
    + ', accesos quitados ' + quitados + ', errores ' + errores + ' (hasta fila ' + (nextRow - 1) + ')');
  if (nextRow > lastRow) { props.deleteProperty(PROP_DESC_ROW); borrarTrig_('continuarDescompartir'); Logger.log('DESCOMPARTIR TERMINADO.'); }
  else { props.setProperty(PROP_DESC_ROW, String(nextRow)); progTrig_('continuarDescompartir'); }
}

function descompartirArchivo_(sheetId, keep) {
  const file = DriveApp.getFileById(sheetId);
  const owner = file.getOwner() ? String(file.getOwner().getEmail() || '').toLowerCase() : '';
  let q = 0;
  const rem = function (u, tipo) {
    const e = String(u.getEmail() || '').toLowerCase();
    if (!e || e === owner || keep[e]) return;
    if (SH.DRY_RUN) { Logger.log('[DRY] quitaria ' + tipo + ' ' + e + ' de ' + sheetId); q++; return; }
    try { if (tipo === 'editor') file.removeEditor(e); else file.removeViewer(e); q++; } catch (_) {}
  };
  file.getEditors().forEach(function (u) { rem(u, 'editor'); });
  file.getViewers().forEach(function (u) { rem(u, 'viewer'); });
  return q;
}

// ============================================================
// COMPARTIR A LA LISTA
// ============================================================

function compartirLista() {
  borrarTrig_('continuarCompartir');
  PropertiesService.getScriptProperties().setProperty(PROP_SHARE_ROW, '2');
  continuarCompartir();
}

function continuarCompartir() {
  const props = PropertiesService.getScriptProperties();
  const start = Date.now();
  const tab = SpreadsheetApp.openById(SH.CONTROL_ID).getSheetByName(SH.SHARE_TAB);
  if (!tab) throw new Error('Falta la pestania "' + SH.SHARE_TAB + '" (A=sheet_id, B=gmail, desde fila 2).');
  const lastRow = tab.getLastRow();

  let row = parseInt(props.getProperty(PROP_SHARE_ROW) || '2', 10);
  const n = lastRow - row + 1;
  if (n <= 0) { props.deleteProperty(PROP_SHARE_ROW); Logger.log('COMPARTIR: nada que hacer.'); return; }

  const data = tab.getRange(row, 1, n, 2).getValues();
  let ok = 0, err = 0, i = 0;
  for (; i < data.length; i++) {
    if (Date.now() - start > SH.MAX_RUNTIME_MS) break;
    const sid = String(data[i][0] || '').trim();
    const email = String(data[i][1] || '').trim().toLowerCase();
    if (!sid || !email) continue;
    try { compartirArchivo_(sid, email); ok++; }
    catch (e) { err++; logErr_(sid, 'compartir ' + email, e.message); }
  }

  const nextRow = row + i;
  Logger.log((SH.DRY_RUN ? '[DRY] ' : '') + 'compartir: ok ' + ok + ', errores ' + err + ' (hasta fila ' + (nextRow - 1) + ')');
  if (nextRow > lastRow) { props.deleteProperty(PROP_SHARE_ROW); borrarTrig_('continuarCompartir'); Logger.log('COMPARTIR TERMINADO.'); }
  else { props.setProperty(PROP_SHARE_ROW, String(nextRow)); progTrig_('continuarCompartir'); }
}

function compartirArchivo_(sheetId, email, sendEmail) {
  if (sendEmail === undefined) sendEmail = SH.SEND_EMAIL;
  if (SH.DRY_RUN) { Logger.log('[DRY] compartiria ' + email + ' (editor + flags seguridad) en ' + sheetId); return; }
  // 1) flags de seguridad en false/desactivadas
  drivePatch_(sheetId, {
    writersCanShare: false,
    downloadRestrictions: { itemDownloadRestriction: { restrictedForWriters: true } },
  });
  // 2) compartir como editor
  drivePermCreate_(sheetId, email, SH.ROLE, sendEmail, SH.EMAIL_MSG);
}

// ============================================================
// PRUEBAS (1 archivo)
// ============================================================

function probarDescompartirUno() {
  if (!TEST_SHEET_ID || TEST_SHEET_ID.indexOf('PEGAR') === 0) { Logger.log('Edita TEST_SHEET_ID primero.'); return; }
  const q = descompartirArchivo_(TEST_SHEET_ID, keepSet_());
  Logger.log('PRUEBA descompartir ' + TEST_SHEET_ID + ': accesos ' + (SH.DRY_RUN ? 'que se quitarian' : 'quitados') + ' = ' + q);
}

function probarCompartirUno() {
  if (!TEST_SHEET_ID || TEST_SHEET_ID.indexOf('PEGAR') === 0) { Logger.log('Edita TEST_SHEET_ID primero.'); return; }
  compartirArchivo_(TEST_SHEET_ID, String(TEST_EMAIL).trim().toLowerCase(), false); // nunca notifica
  Logger.log('PRUEBA compartir ' + TEST_EMAIL + ' en ' + TEST_SHEET_ID + ' (editor + flags, sin mail)' + (SH.DRY_RUN ? ' [DRY]' : ''));
}

// ============================================================
// DRIVE REST v3 (via token del script)
// ============================================================

function drivePatch_(fileId, body) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?supportsAllDrives=true&fields=id';
  const res = UrlFetchApp.fetch(url, {
    method: 'patch', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body), muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('PATCH ' + res.getResponseCode() + ': ' + res.getContentText());
}

function drivePermCreate_(fileId, email, role, sendEmail, msg) {
  let url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '/permissions'
    + '?sendNotificationEmail=' + (sendEmail ? 'true' : 'false') + '&supportsAllDrives=true&fields=id';
  if (sendEmail && msg) url += '&emailMessage=' + encodeURIComponent(msg);
  const res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ role: role, type: 'user', emailAddress: email }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('PERM ' + res.getResponseCode() + ': ' + res.getContentText());
}

// ============================================================
// UTIL
// ============================================================

function keepSet_() {
  const m = {};
  (SH.KEEP || []).forEach(function (e) { e = String(e || '').trim().toLowerCase(); if (e) m[e] = true; });
  return m;
}

function logErr_(sheetId, accion, msg) {
  Logger.log('ERR ' + accion + ' ' + sheetId + ': ' + msg);
  try {
    const ss = SpreadsheetApp.openById(SH.CONTROL_ID);
    const tab = ss.getSheetByName(SH.LOG_TAB) || ss.insertSheet(SH.LOG_TAB);
    if (tab.getLastRow() === 0) tab.appendRow(['ts', 'sheet_id', 'accion', 'error']);
    tab.appendRow([new Date(), sheetId, accion, msg]);
  } catch (_) {}
}

function borrarTrig_(handler) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
}

function progTrig_(handler) {
  borrarTrig_(handler);
  ScriptApp.newTrigger(handler).timeBased().after(SH.RETRASO_TRIGGER_MS).create();
  Logger.log('Corte por tiempo. Continua solo en ~' + (SH.RETRASO_TRIGGER_MS / 1000) + 's (o corre ' + handler + ' a mano).');
}
