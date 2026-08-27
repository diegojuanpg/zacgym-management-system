/**
 * ZAC GYM - Actualizacion de rutinas por ASISTENCIA (semanal, domingo 3am).
 *
 * VA EN EL PROYECTO "Control de usuarios" (junto al codigo del profe).
 * Reusa: procesarYExtraerEntrenamiento_, realizarTareasPreActualizacion_,
 *        borrarTriggersAnteriores_. (NO usa calcularFechaObjetivo_: ver _fechasSemana_.)
 * Lee check-ins y alumnos de Supabase.
 *
 * Regla ACTIVA (RUT.SOLO_AVANZAR = true), check-ins de la semana = dias distintos, 1 por dia:
 *   >= 1 check-in       -> AVANZAR a la semana que viene (fecha = lunes proximo) + RMs.
 *   activo sin check-in -> NADA.
 *   No descomparte a nadie y no repite bloque. No mira dias_entrenamiento.
 *   sin semana programada -> log ERROR con etiqueta en Supabase.pipeline_logs.
 *
 * Regla original (RUT.SOLO_AVANZAR = false), sigue en el codigo para volver cuando haga falta:
 *   >= techo(dias/2)  -> AVANZAR.
 *   <  techo          -> REPETIR: re-fechar el bloque actual al lunes proximo.
 *   activo sin check-in -> NADA.
 *   vencio la semana pasada y no renovo -> DESCOMPARTIR (quitar acceso al mail del alumno).
 *   sin dias / sin semana programada -> log ERROR.
 *
 * SETUP (una vez):
 *   1. setSecretsRutinas        -> pega el service_role JWT (legacy) de Supabase, corre, borra.
 *   2. add_ultima_rutina_semana.sql corrido en Supabase.
 *   3. instalarTriggerRutinas   -> deja el trigger de los domingos 3am.
 *
 * USO:
 *   probarFechasSemana()        -> self-check de fechas, no toca nada.
 *   previewActualizarRutinas()  -> DRY-RUN de TODOS: reporta decisiones, no toca nada.
 *   probarUnAlumno()            -> prueba REAL en 1 (editar EMAIL_PRUEBA). Loguea detalle.
 *   actualizarRutinasSemanal()  -> REAL de todos (lo dispara el trigger).
 */

const RUT = {
  SUPA_URL: 'https://lrjqasglgmcxntuwamow.supabase.co',
  MAX_RUNTIME_MS: 4 * 60 * 1000, // margen amplio antes del tope duro de 6min de Apps Script (un alumno lento en Sheets puede tardar >1min)
  RETRASO_TRIGGER_MS: 90 * 1000,
  TZ: 'America/Argentina/Buenos_Aires',
  // Modo temporal: con >= 1 check-in en la semana -> AVANZAR. No descomparte, no repite,
  // no mira dias_entrenamiento. Poner en false para volver a la regla por umbral.
  SOLO_AVANZAR: true,
};
const PROP_RUT_SECRET = 'RUTINAS_SUPABASE_SECRET';
const PROP_RUT_ATRASADA = 'RUTINAS_ATRASADA_LUNES';

// Para probarUnAlumno: cambia este mail por el del alumno a testear.
const EMAIL_PRUEBA = 'CAMBIAR_EMAIL_ACA@gmail.com';

function setSecretsRutinas() {
  PropertiesService.getScriptProperties().setProperty(PROP_RUT_SECRET, 'PEGAR_SERVICE_ROLE_JWT_ACA');
  Logger.log('Secret guardada. Borra el valor del codigo por seguridad.');
}

// ============================================================
// ENTRADAS
// ============================================================

function previewActualizarRutinas() { _correrLoteRutinas_(true); }       // DRY-RUN (todos)
function actualizarRutinasSemanal() {                                     // REAL (trigger semanal)
  borrarTriggersAnteriores_('procesarLoteRutinas');
  PropertiesService.getScriptProperties().deleteProperty(PROP_RUT_ATRASADA); // corrida nueva: no heredar el lunes de una anterior
  procesarLoteRutinas();
}
// REAL (continuaciones). La corrida arranca un dia y puede continuar despues de medianoche:
// sin el lunes fijo, _fechasSemana_ salta a la semana siguiente y las rutinas que faltan
// quedan fechadas un lunes de mas (y la ventana de check-ins se corre a la semana nueva, vacia).
function procesarLoteRutinas() {
  const lunes = PropertiesService.getScriptProperties().getProperty(PROP_RUT_ATRASADA);
  _correrLoteRutinas_(false, lunes ? _fechasSemanaDesde_(lunes) : null, 'procesarLoteRutinas');
}

// --- Catch-up: corre la corrida que se salteo (domingo pasado) usando fechas fijas ---
// Cambia LUNES_ATRASADO si la semana salteada es otra. Formato 'YYYY-MM-DD', ese lunes = "semana actual" que se iba a evaluar.
const LUNES_ATRASADO = '2026-08-17'; // mira check-ins 17/08-23/08, fecha las rutinas al 24/08
function previewActualizarRutinasAtrasada() { _correrLoteRutinas_(true, _fechasSemanaDesde_(LUNES_ATRASADO)); }
function actualizarRutinasAtrasada() {
  borrarTriggersAnteriores_('procesarLoteRutinasAtrasada');
  PropertiesService.getScriptProperties().deleteProperty(PROP_RUT_ATRASADA); // corrida nueva: no heredar el lunes de una anterior
  _correrLoteRutinas_(false, _fechasSemanaDesde_(LUNES_ATRASADO), 'procesarLoteRutinasAtrasada');
}
// Continuacion automatica si actualizarRutinasAtrasada corta por tiempo (> MAX_RUNTIME_MS).
function procesarLoteRutinasAtrasada() {
  const lunes = PropertiesService.getScriptProperties().getProperty(PROP_RUT_ATRASADA) || LUNES_ATRASADO;
  _correrLoteRutinas_(false, _fechasSemanaDesde_(lunes), 'procesarLoteRutinasAtrasada');
}

/** Self-check de fechas (no toca nada). Corre esto si una rutina vuelve a quedar mal fechada. */
function probarFechasSemana() {
  function chk(hoyYmd, lunesEsta, lunesProx) {
    const f = _fechasSemanaDesde_(hoyYmd); // reusa el mismo constructor -03:00 que _fechasSemana_
    const hoy = new Date(hoyYmd + 'T00:00:00-03:00');
    const dow = hoy.getUTCDay();
    const real = _fechasSemanaDesde_(_ymd_(new Date(hoy.getTime() + (dow === 0 ? -6 : 1 - dow) * 86400000)));
    if (real.lunesEstaYmd !== lunesEsta || real.lunesProxYmd !== lunesProx) {
      throw new Error('FECHAS MAL para ' + hoyYmd + ': esperaba ' + lunesEsta + '/' + lunesProx
        + ', dio ' + real.lunesEstaYmd + '/' + real.lunesProxYmd);
    }
    return f;
  }
  chk('2026-08-16', '2026-08-10', '2026-08-17'); // domingo 3am: la corrida real del trigger
  chk('2026-08-17', '2026-08-17', '2026-08-24'); // lunes
  chk('2026-08-15', '2026-08-10', '2026-08-17'); // sabado

  // La fecha que se escribe en la planilla tiene que dar el mismo dia aunque se renderice
  // en un huso al oeste de ART. Si vuelve a fallar el 24/08 -> 23/08, esto lo caza.
  const lp = _fechasSemanaDesde_('2026-08-17').lunesProx;
  ['GMT-5', 'GMT-3', 'GMT+0'].forEach(function (tz) {
    const got = Utilities.formatDate(lp, tz, 'yyyy-MM-dd');
    if (got !== '2026-08-24') throw new Error('lunesProx se corre de dia en ' + tz + ': ' + got);
  });

  const f = _fechasSemana_();
  Logger.log('OK. Hoy -> lunesProx ' + f.lunesProxYmd + ' (' + f.lunesProx.toISOString() + ')'
    + ' | check-ins ' + _ymd_(f.desdeIso) + ' a ' + _ymd_(new Date(new Date(f.hastaIso).getTime() - 1))
    + ' | semana pasada ' + f.iniPasadaYmd + ' a ' + f.finPasadaYmd);
}

/** Self-check de _decidir_ en los dos modos (no toca nada). Corre esto si tocas SOLO_AVANZAR. */
function probarDecidir() {
  const f = _fechasSemanaDesde_('2026-08-10');            // semana pasada = 03/08 a 09/08
  const venc = new Date('2026-08-05T12:00:00-03:00');      // vencido dentro de esa semana
  function eq(got, exp, caso) {
    if (got !== exp) throw new Error('DECIDIR MAL [' + caso + ']: esperaba ' + exp + ', dio ' + got);
  }
  const modo = RUT.SOLO_AVANZAR;
  try {
    RUT.SOLO_AVANZAR = true;
    eq(_decidir_({ dias_entrenamiento: 5, vencimiento: venc }, 1, f).accion, 'avanzar', 'vencido con 1 check-in igual avanza');
    eq(_decidir_({ dias_entrenamiento: 5 }, 0, f).accion, 'nada', 'sin check-in');
    eq(_decidir_({ dias_entrenamiento: null }, 2, f).accion, 'avanzar', 'sin dias_entrenamiento igual avanza');

    RUT.SOLO_AVANZAR = false;
    eq(_decidir_({ dias_entrenamiento: 5, vencimiento: venc }, 3, f).accion, 'descompartir', 'vencido manda sobre check-ins');
    eq(_decidir_({ dias_entrenamiento: 5 }, 3, f).accion, 'avanzar', '3 >= techo(5/2)=3');
    eq(_decidir_({ dias_entrenamiento: 5 }, 2, f).accion, 'repetir', '2 < 3');
    eq(_decidir_({ dias_entrenamiento: null }, 2, f).accion, 'sin_dias', 'sin dias_entrenamiento');
  } finally {
    RUT.SOLO_AVANZAR = modo;
  }
  Logger.log('OK. Modo activo: ' + (RUT.SOLO_AVANZAR
    ? 'SOLO_AVANZAR (>=1 check-in avanza; no descomparte, no repite)'
    : 'original (umbral dias/2 + descompartir)'));
}

/** Prueba REAL sobre UN alumno (EMAIL_PRUEBA). Loguea dias, check-ins, vencimiento y accion. */
function probarUnAlumno() {
  const email = String(EMAIL_PRUEBA || '').trim().toLowerCase();
  if (!email || email.indexOf('cambiar_email') === 0) { Logger.log('Edita EMAIL_PRUEBA primero.'); return; }

  const rows = rutGet_('alumnos_tracking?select=id,gmail,nombre,sheet_id,dias_entrenamiento,vencimiento,activo,ultima_rutina_semana'
    + '&gmail=eq.' + encodeURIComponent(email) + '&limit=1');
  if (!rows.length) { Logger.log('No existe en alumnos_tracking: ' + email); return; }
  const a = rows[0];

  const f = _fechasSemana_();
  const dias = _diasCheckinDeUno_(a.id, f.desdeIso);   // fechas ymd de check-in de la semana
  const cnt = dias.length;
  const dec = _decidir_(a, cnt, f);
  const umbral = (a.dias_entrenamiento != null) ? Math.ceil(a.dias_entrenamiento / 2) : null;

  Logger.log(
    'ALUMNO: ' + (a.nombre || a.gmail) +
    '\n  gmail:             ' + a.gmail +
    '\n  dias_entrenamiento:' + a.dias_entrenamiento + (umbral != null ? '  (umbral ' + umbral + ')' : '') +
    '\n  check-ins semana:  ' + cnt + (cnt ? '  [' + dias.join(', ') + ']' : '') +
    '\n  vencimiento:       ' + (a.vencimiento ? _ymd_(a.vencimiento) : '-') +
    '\n  activo:            ' + a.activo +
    '\n  ACCION:            ' + dec.accion.toUpperCase() +
    '\n  (semana objetivo:  ' + f.lunesProxYmd + ')'
  );

  if (a.sheet_id == null) { Logger.log('  Sin sheet_id -> no se ejecuta.'); return; }
  if (a.ultima_rutina_semana === f.lunesProxYmd) {
    Logger.log('  YA fue procesado esta semana (marca=' + f.lunesProxYmd + '). NO se re-ejecuta.');
    return;
  }
  if (dec.accion === 'nada') { Logger.log('  No hay accion (activo sin check-in).'); return; }

  const res = _aplicar_(a, dec, f);
  if (dec.accion === 'sin_dias') rutLog_('error', 'sin dias de entrenamiento', 'sin_dias', { id: a.id, gmail: a.gmail });
  else if (!res.ok) rutLog_('error', res.status + ': ' + (res.error || ''), res.status, { id: a.id, gmail: a.gmail });
  _marcar_(a.id, f.lunesProxYmd);
  Logger.log('  RESULTADO: ' + res.status + (res.bloque ? ' (bloque "' + res.bloque + '")' : '') + (res.error ? ' | ' + res.error : ''));
}

// ============================================================
// NUCLEO
// ============================================================

function _correrLoteRutinas_(dryRun, fFijo, fnContinua) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  const start = Date.now();
  try {
    const f = fFijo || _fechasSemana_();
    const asistencia = _asistenciaSemana_(f.desdeIso, f.hastaIso);   // { user_id: diasDistintos }
    const alumnos = rutGet_('alumnos_tracking?select=id,gmail,sheet_id,dias_entrenamiento,vencimiento,ultima_rutina_semana'
      + '&activo=is.true&sheet_id=not.is.null');
    const pendientes = dryRun ? alumnos : alumnos.filter(function (a) { return a.ultima_rutina_semana !== f.lunesProxYmd; });

    const c = { avanzar: 0, repetir: 0, descompartir: 0, sin_dias: 0, nada: 0, errores: 0 };
    const reporte = [];
    const descompartirLista = [];

    for (let i = 0; i < pendientes.length; i++) {
      if (!dryRun && Date.now() - start > RUT.MAX_RUNTIME_MS) {
        const fnSigue = fnContinua || 'procesarLoteRutinas';
        // Siempre: la continuacion tiene que seguir con el MISMO lunes, aunque caiga al otro dia.
        PropertiesService.getScriptProperties().setProperty(PROP_RUT_ATRASADA, f.lunesEstaYmd);
        borrarTriggersAnteriores_(fnSigue);
        ScriptApp.newTrigger(fnSigue).timeBased().after(RUT.RETRASO_TRIGGER_MS).create();
        Logger.log('Corte por tiempo. Continua en ~' + (RUT.RETRASO_TRIGGER_MS / 1000) + 's. Restantes: ' + (pendientes.length - i));
        return;
      }
      const a = pendientes[i];
      const cnt = asistencia[a.id] || 0;
      const dec = _decidir_(a, cnt, f);
      c[dec.accion === 'nada' ? 'nada' : dec.accion]++;

      reporte.push(_pad_(dec.accion.toUpperCase(), 13) + (a.gmail || a.id)
        + (dec.accion === 'avanzar' || dec.accion === 'repetir' ? '  (' + cnt + '/' + a.dias_entrenamiento + ')' : '')
        + (dec.accion === 'descompartir' ? '  (vto ' + _ymd_(a.vencimiento) + ')' : ''));
      if (dec.accion === 'descompartir') descompartirLista.push({ gmail: a.gmail, vencimiento: _ymd_(a.vencimiento) });

      if (dryRun || dec.accion === 'nada') continue;

      try {
        const res = _aplicar_(a, dec, f);
        if (dec.accion === 'sin_dias') rutLog_('error', 'sin dias de entrenamiento', 'sin_dias', { id: a.id, gmail: a.gmail });
        else if (!res.ok) { c.errores++; rutLog_('error', res.status + ': ' + (res.error || ''), res.status, { id: a.id, gmail: a.gmail }); }
        _marcar_(a.id, f.lunesProxYmd);
      } catch (e) {
        c.errores++;
        Logger.log('Error con ' + (a.gmail || a.id) + ': ' + e.message);
        rutLog_('error', e.message, 'excepcion', { id: a.id, gmail: a.gmail });
        _marcar_(a.id, f.lunesProxYmd);
      }
    }

    if (!dryRun) {
      borrarTriggersAnteriores_(fnContinua || 'procesarLoteRutinas');
      PropertiesService.getScriptProperties().deleteProperty(PROP_RUT_ATRASADA);
    }
    Logger.log((dryRun ? '[DRY-RUN] ' : '') + 'lunes prox ' + f.lunesProxYmd
      + ' | avanzar: ' + c.avanzar + ', repetir: ' + c.repetir + ', descompartir: ' + c.descompartir
      + ', sin_dias: ' + c.sin_dias + ', activo_sin_checkin(nada): ' + c.nada + ', errores: ' + c.errores);
    if (dryRun) Logger.log('DETALLE:\n' + reporte.join('\n'));

    // Logger.log trunca listas largas. Lista completa de descompartir va a pipeline_logs (sin corte).
    if (descompartirLista.length) {
      rutLog_('info', (dryRun ? '[DRY-RUN] ' : '') + 'listado descompartir ' + f.lunesProxYmd,
        'detalle_descompartir', { lunesProx: f.lunesProxYmd, count: descompartirLista.length, lista: descompartirLista });
    }
  } finally {
    lock.releaseLock();
  }
}

// ---------- Decision (pura, sin efectos) ----------

function _decidir_(a, cnt, f) {
  if (RUT.SOLO_AVANZAR) return { accion: cnt > 0 ? 'avanzar' : 'nada' };

  const vy = a.vencimiento ? _ymd_(a.vencimiento) : null;
  if (vy && vy >= f.iniPasadaYmd && vy <= f.finPasadaYmd) return { accion: 'descompartir' };
  if (cnt === 0) return { accion: 'nada' };
  if (a.dias_entrenamiento == null) return { accion: 'sin_dias' };
  const umbral = Math.ceil(a.dias_entrenamiento / 2);
  return { accion: cnt >= umbral ? 'avanzar' : 'repetir', umbral: umbral };
}

// ---------- Aplicacion (efectos reales) ----------

function _aplicar_(a, dec, f) {
  if (dec.accion === 'descompartir') {
    if (!a.gmail) return { ok: false, status: 'descompartir_sin_mail' };
    _descompartir_(a.sheet_id, a.gmail);
    return { ok: true, status: 'descompartido' };
  }
  if (dec.accion === 'avanzar') {
    realizarTareasPreActualizacion_(a.sheet_id);
    const r = procesarYExtraerEntrenamiento_(a.sheet_id, f.lunesProx, false, f.lunesProx);
    return r.rutinaStatus === 'Actualizada'
      ? { ok: true, status: 'avanzado', bloque: r.entrenamientoInfo.bloque }
      : { ok: false, status: 'sin_semana', error: r.entrenamientoInfo.error };
  }
  if (dec.accion === 'repetir') {
    const fechaActual = new Date(f.lunesProx.getTime() - 7 * 86400000); // lunes de esta semana
    const r = procesarYExtraerEntrenamiento_(a.sheet_id, fechaActual, true, f.lunesProx);
    return r.rutinaStatus === 'Actualizada'
      ? { ok: true, status: 'repetido', bloque: r.entrenamientoInfo.bloque }
      : { ok: false, status: 'repetir_error', error: r.entrenamientoInfo.error };
  }
  return { ok: true, status: 'nada' };
}

// ============================================================
// SUPABASE / DATOS
// ============================================================

// Calcula el lunes de esta semana en hora Argentina y delega en _fechasSemanaDesde_.
// NO usa calcularFechaObjetivo_: esa devuelve el lunes a medianoche UTC, y una fecha
// asi renderizada en Argentina (UTC-3) cae al domingo anterior -> la rutina quedaba
// fechada un dia antes (17/08 se escribia 16/08).
function _fechasSemana_() {
  const hoy = new Date(_ymd_(new Date()) + 'T00:00:00-03:00'); // hoy a las 00:00 ART
  const dow = hoy.getUTCDay();                                 // 0=dom .. 6=sab (fijo, no depende del huso del proyecto)
  const aLunes = (dow === 0 ? -6 : 1 - dow);                   // el domingo cierra la semana, no la abre
  return _fechasSemanaDesde_(_ymd_(new Date(hoy.getTime() + aLunes * 86400000)));
}

// Version de _fechasSemana_ con "lunes de esta semana" fijo, para catch-up (no depende de "hoy").
// hastaIso acota la ventana de check-ins al Mon-Sun exacto (necesario porque, al correr despues
// de que lunesProx ya empezo, _asistenciaSemana_ sin tope sumaria check-ins de la semana nueva).
function _fechasSemanaDesde_(lunesEstaYmd) {
  const lunesEsta = new Date(lunesEstaYmd + 'T00:00:00-03:00'); // Argentina: UTC-3 fijo, sin DST
  const lunesProx0 = new Date(lunesEsta.getTime() + 7 * 86400000); // lunes prox 00:00 ART (borde de la ventana)
  // La fecha que va a la planilla se ancla al MEDIODIA ART: a las 00:00 cualquier huso al oeste
  // (proyecto o planilla en UTC-4 o mas) la renderiza el dia anterior (24/08 se escribia 23/08).
  const lunesProx = new Date(lunesProx0.getTime() + 12 * 3600000);
  return {
    lunesEstaYmd: lunesEstaYmd,
    lunesProx: lunesProx,
    lunesProxYmd: _ymd_(lunesProx),
    iniPasadaYmd: _ymd_(new Date(lunesEsta.getTime() - 7 * 86400000)),
    finPasadaYmd: _ymd_(new Date(lunesEsta.getTime() - 1 * 86400000)),
    desdeIso: lunesEsta.toISOString(),
    hastaIso: lunesProx0.toISOString(), // ventana de check-ins: medianoche exacta, no el mediodia
  };
}

function _asistenciaSemana_(desdeIso, hastaIso) {
  let q = 'check_ins?select=user_id,check_in_time&user_id=not.is.null&check_in_time=gte.' + encodeURIComponent(desdeIso);
  if (hastaIso) q += '&check_in_time=lt.' + encodeURIComponent(hastaIso);
  const rows = rutGet_(q);
  const dias = {};
  rows.forEach(function (r) { const u = r.user_id; (dias[u] || (dias[u] = {}))[_ymd_(r.check_in_time)] = true; });
  const cnt = {};
  Object.keys(dias).forEach(function (u) { cnt[u] = Object.keys(dias[u]).length; });
  return cnt;
}

function _diasCheckinDeUno_(userId, desdeIso) {
  const rows = rutGet_('check_ins?select=check_in_time&user_id=eq.' + encodeURIComponent(userId)
    + '&check_in_time=gte.' + encodeURIComponent(desdeIso));
  const set = {};
  rows.forEach(function (r) { set[_ymd_(r.check_in_time)] = true; });
  return Object.keys(set).sort();
}

function _descompartir_(sheetId, email) {
  const file = DriveApp.getFileById(sheetId);
  try { file.removeEditor(email); } catch (e) {}
  try { file.removeViewer(email); } catch (e) {}
}

function _marcar_(id, lunesProxYmd) {
  rutPatch_('alumnos_tracking?id=eq.' + encodeURIComponent(id), { ultima_rutina_semana: lunesProxYmd });
}

// ---------- REST helpers ----------

function rutHeaders_() {
  const s = PropertiesService.getScriptProperties().getProperty(PROP_RUT_SECRET);
  if (!s || s === 'PEGAR_SERVICE_ROLE_JWT_ACA') throw new Error('Falta secret. Corre setSecretsRutinas.');
  return { apikey: s, authorization: 'Bearer ' + s };
}
function rutGet_(pathQuery) {
  const res = UrlFetchApp.fetch(RUT.SUPA_URL + '/rest/v1/' + pathQuery, { headers: rutHeaders_(), muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('Supabase GET ' + pathQuery + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}
function rutPatch_(pathQuery, obj) {
  const res = UrlFetchApp.fetch(RUT.SUPA_URL + '/rest/v1/' + pathQuery, {
    method: 'patch', contentType: 'application/json',
    headers: Object.assign(rutHeaders_(), { Prefer: 'return=minimal' }),
    payload: JSON.stringify(obj), muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase PATCH ' + pathQuery + ': ' + res.getContentText());
}
function rutLog_(nivel, mensaje, tag, extra) {
  try {
    const ctx = Object.assign({ tag: tag }, extra || {});
    UrlFetchApp.fetch(RUT.SUPA_URL + '/rest/v1/pipeline_logs', {
      method: 'post', contentType: 'application/json',
      headers: Object.assign(rutHeaders_(), { Prefer: 'return=minimal' }),
      payload: JSON.stringify([{ pipeline: 'rutinas', nivel: nivel, mensaje: mensaje, contexto: ctx }]),
      muteHttpExceptions: true,
    });
  } catch (e) { Logger.log('log fail: ' + e); }
}

// ---------- Util ----------

function _ymd_(d) { return Utilities.formatDate(new Date(d), RUT.TZ, 'yyyy-MM-dd'); }
function _pad_(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

// ---------- Trigger ----------

function instalarTriggerRutinas() {
  borrarTriggersAnteriores_('actualizarRutinasSemanal');
  ScriptApp.newTrigger('actualizarRutinasSemanal')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  Logger.log('Trigger instalado: domingos 3am (hora del proyecto). Verifica huso ' + RUT.TZ + '.');
}
