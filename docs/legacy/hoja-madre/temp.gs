/**
 * ZAC GYM - Avance UNICO de rutinas (temporal, corrida manual).
 *
 * Adelanta al BLOQUE SIGUIENTE (semana que viene, fechado al lunes proximo) a todos
 * los alumnos de la pestania AvanzarList. Es para dejar todo al dia ANTES de empezar
 * a usar el sistema semanal RutinasPorAsistencia. No instala ningun trigger recurrente.
 *
 * VA EN EL PROYECTO "Control de usuarios" (reusa procesarYExtraerEntrenamiento_,
 * realizarTareasPreActualizacion_, calcularFechaObjetivo_, borrarTriggersAnteriores_).
 *
 * Pestania AvanzarList: A=nombre, B=sheet_id, C=estado (la llena el script).
 *   - importar avanzar_checkin_semana.csv y renombrar la pestania a "AvanzarList".
 *
 * MARCA para no re-recorrer: escribe "avanzado" en C. Si re-corres, saltea los ya
 * "avanzado" (nunca avanza dos bloques). Los que fallan quedan "error: ..." y se
 * reintentan en la proxima corrida.
 *
 * Corta antes de los 6 min, guarda progreso (en la columna C) y auto-continua con
 * un trigger cada ~60s.
 *
 * USO:
 *   probarAvanzarUno()  -> prueba REAL en 1 (editar TEST_SHEET_ID_AV).
 *   avanzarLista()      -> avanza a todos los pendientes (auto-continua).
 *   continuarAvanzar()  -> continua (lo llama el trigger; tambien a mano).
 */

const AV = {
  CONTROL_ID: '1AJ7rleF-zHcBpKnV5UPbQe04ZABQOw3Kk8UOuxy9ryg',
  LIST_TAB: 'AvanzarList',   // A=nombre, B=sheet_id, C=estado
  DRY_RUN: false,            // true = no toca nada, solo loguea
  MAX_RUNTIME_MS: 5 * 60 * 1000,
  RETRASO_TRIGGER_MS: 60 * 1000,
  TZ: 'America/Argentina/Buenos_Aires',
};
const TEST_SHEET_ID_AV = '1d_sjen9xfA7HEYdah8XH5D0cuaccZcZcNyoOjB1eKrQ';

// ---------- Entradas ----------

function avanzarLista() {
  borrarTriggersAnteriores_('continuarAvanzar');
  continuarAvanzar();
}

function continuarAvanzar() {
  const start = Date.now();
  const tab = SpreadsheetApp.openById(AV.CONTROL_ID).getSheetByName(AV.LIST_TAB);
  if (!tab) throw new Error('Falta la pestania "' + AV.LIST_TAB + '" (A=nombre, B=sheet_id, C=estado).');
  const last = tab.getLastRow();
  if (last < 2) { Logger.log('AvanzarList vacia.'); return; }
  if (String(tab.getRange(1, 3).getValue() || '').trim() === '') tab.getRange(1, 3).setValue('estado');

  const rows = tab.getRange(2, 1, last - 1, 3).getValues(); // A,B,C
  const f = _avFechas_();

  let ok = 0, err = 0, skip = 0, brokeTime = false;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][2] || '').trim() === 'avanzado') { skip++; continue; }
    if (Date.now() - start > AV.MAX_RUNTIME_MS) { brokeTime = true; break; }

    const sid = String(rows[i][1] || '').trim();
    if (!sid) continue;
    const cell = tab.getRange(2 + i, 3);

    if (AV.DRY_RUN) { Logger.log('[DRY] avanzaria ' + sid + ' -> ' + f.lunesProxYmd); ok++; continue; }

    try {
      realizarTareasPreActualizacion_(sid);
      const r = procesarYExtraerEntrenamiento_(sid, f.lunesProx, false, f.lunesProx);
      if (r.rutinaStatus === 'Actualizada') {
        cell.setValue('avanzado');
        ok++;
      } else {
        cell.setValue('error: ' + ((r.entrenamientoInfo && r.entrenamientoInfo.error) || 'sin semana siguiente'));
        err++;
      }
    } catch (e) {
      cell.setValue('error: ' + e.message);
      err++;
    }
  }

  Logger.log((AV.DRY_RUN ? '[DRY] ' : '') + 'avanzar -> lunes ' + f.lunesProxYmd
    + ' | ok ' + ok + ', error ' + err + ', ya avanzados ' + skip);
  if (brokeTime) {
    borrarTriggersAnteriores_('continuarAvanzar');
    ScriptApp.newTrigger('continuarAvanzar').timeBased().after(AV.RETRASO_TRIGGER_MS).create();
    Logger.log('Corte por tiempo. Continua solo en ~' + (AV.RETRASO_TRIGGER_MS / 1000) + 's (o corre continuarAvanzar).');
  } else {
    borrarTriggersAnteriores_('continuarAvanzar');
    Logger.log('AVANZAR TERMINADO.');
  }
}

// ---------- Prueba (1 alumno) ----------

function probarAvanzarUno() {
  if (!TEST_SHEET_ID_AV || TEST_SHEET_ID_AV.indexOf('PEGAR') === 0) { Logger.log('Edita TEST_SHEET_ID_AV primero.'); return; }
  const f = _avFechas_();
  if (AV.DRY_RUN) { Logger.log('[DRY] avanzaria ' + TEST_SHEET_ID_AV + ' -> ' + f.lunesProxYmd); return; }
  realizarTareasPreActualizacion_(TEST_SHEET_ID_AV);
  const r = procesarYExtraerEntrenamiento_(TEST_SHEET_ID_AV, f.lunesProx, false, f.lunesProx);
  Logger.log('PRUEBA avanzar ' + TEST_SHEET_ID_AV + ': ' + r.rutinaStatus
    + (r.entrenamientoInfo ? ' | bloque ' + (r.entrenamientoInfo.bloque || '-') + (r.entrenamientoInfo.error ? ' | ' + r.entrenamientoInfo.error : '') : ''));
}

// ---------- Util ----------

function _avFechas_() {
  const lunesProx = calcularFechaObjetivo_('Semana que viene');
  return { lunesProx: lunesProx, lunesProxYmd: Utilities.formatDate(lunesProx, AV.TZ, 'yyyy-MM-dd') };
}

