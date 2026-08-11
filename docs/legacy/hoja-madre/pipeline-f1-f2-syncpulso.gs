/**
 * ZAC GYM - Pipeline PulsoFlow -> Supabase (Apps Script)
 *
 * SETUP (una vez, desde el editor Apps Script, boton "Ejecutar" eligiendo la funcion):
 *   1. requestOtp            -> llega codigo de 6 digitos al mail
 *   2. pegar codigo en OTP_CODE_INPUT
 *   3. verifyOtp             -> guarda la sesion (refresh token). No repetir salvo que se caiga.
 *   4. dumpMembershipShape   -> imprime 1 socio en el Log (para afinar el mapeo de members)
 *   5. syncCheckins          -> baja check-ins a Supabase (primera vez: desde 01/01/2026)
 *   6. syncMembers           -> baja socios a Supabase
 *   7. rebuildTracking       -> arma alumnos_tracking (join en el server)
 *   8. installDailyTrigger   -> deja el trigger de las 3am (corre runDaily)
 *
 * runDaily() hace 5+6+7 juntos, con logging y mail si algo falla.
 */

// Pegar aca el codigo de 6 digitos (solo para el paso 3, una vez).
const OTP_CODE_INPUT = 'PEGAR_CODIGO_ACA';

const CONFIG = {
  EMAIL: 'diegojp2005@gmail.com',

  // --- AUTH: Supabase de PulsoFlow (GoTrue) + anon key. Solo para loguearse. ---
  PF_AUTH_URL:  'https://qsfxuyytmowwfszdonjs.supabase.co',
  PF_ANON_KEY:  'sb_publishable_CJD4oK4KclJ4HLCuruSrEQ_YOZFV14B',
  API_BASE:     'https://api.pulsoflow.app',

  // --- DESTINO: TU Supabase. La secret va en Script Properties (ver setSecrets). ---
  DEST_URL: 'https://lrjqasglgmcxntuwamow.supabase.co',
  // DEST_SECRET se lee de ScriptProperties (no hardcodear la secret aca).

  PAGE_SIZE: 200,
  BACKFILL_START: '2026-01-01T00:00:00.000Z', // primera corrida trae desde aca

  SHEET_NAME: 'Check-ins',           // compat con Dashboard.gs (ya no se usa para escribir)
  DASHBOARD_SHEET_NAME: 'Dashboard',
};

const PROP_REFRESH_TOKEN = 'PULSOFLOW_REFRESH_TOKEN';
const PROP_DEST_SECRET    = 'DEST_SUPABASE_SECRET';

/**
 * Correr UNA vez para guardar la secret de TU Supabase en Script Properties.
 * IMPORTANTE: usar la key LEGACY service_role (un JWT largo "eyJ...").
 * NO la sb_secret_...: Supabase la bloquea desde Apps Script ("uso en browser").
 * Settings > API Keys > Legacy API keys > service_role.
 * Pega el JWT abajo, corre esta funcion, despues borra el valor de aca.
 */
function setSecrets() {
  PropertiesService.getScriptProperties()
    .setProperty(PROP_DEST_SECRET, 'PEGAR_SERVICE_ROLE_JWT_ACA');
  Logger.log('Secret guardada. Borra el valor del codigo por seguridad.');
}

// ============================================================
// AUTH (PulsoFlow via Supabase GoTrue)
// ============================================================

function requestOtp() {
  const res = UrlFetchApp.fetch(CONFIG.PF_AUTH_URL + '/auth/v1/otp', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: CONFIG.PF_ANON_KEY },
    payload: JSON.stringify({ email: CONFIG.EMAIL, create_user: false }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Error pidiendo OTP: ' + res.getContentText());
  Logger.log('Codigo enviado a ' + CONFIG.EMAIL + '. Revisa el mail y pegalo en OTP_CODE_INPUT.');
}

function verifyOtp() {
  if (!OTP_CODE_INPUT || OTP_CODE_INPUT === 'PEGAR_CODIGO_ACA') {
    throw new Error('Pega el codigo en OTP_CODE_INPUT antes de correr esto.');
  }
  const res = UrlFetchApp.fetch(CONFIG.PF_AUTH_URL + '/auth/v1/verify', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: CONFIG.PF_ANON_KEY },
    payload: JSON.stringify({ email: CONFIG.EMAIL, token: OTP_CODE_INPUT, type: 'email' }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Codigo invalido o vencido: ' + res.getContentText());
  const data = JSON.parse(res.getContentText());
  PropertiesService.getScriptProperties().setProperty(PROP_REFRESH_TOKEN, data.refresh_token);
  Logger.log('Sesion guardada. Ya podes correr los sync.');
}

/** Rota el refresh token y devuelve un access token fresco. */
function getAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const refreshToken = props.getProperty(PROP_REFRESH_TOKEN);
  if (!refreshToken) throw new Error('No hay sesion. Corre requestOtp + verifyOtp primero.');
  const res = UrlFetchApp.fetch(CONFIG.PF_AUTH_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: CONFIG.PF_ANON_KEY },
    payload: JSON.stringify({ refresh_token: refreshToken }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('No se pudo refrescar la sesion (rehacer login): ' + res.getContentText());
  }
  const data = JSON.parse(res.getContentText());
  props.setProperty(PROP_REFRESH_TOKEN, data.refresh_token); // el viejo queda invalido
  return data.access_token;
}

// ============================================================
// PulsoFlow API
// ============================================================

function pfGet_(path, accessToken) {
  const res = UrlFetchApp.fetch(CONFIG.API_BASE + path, {
    headers: { authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('API ' + path + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

function getServiceId_(accessToken) {
  const services = pfGet_('/services', accessToken);
  if (!services.length) throw new Error('No hay services en esta cuenta.');
  return services[0].id;
}

// ============================================================
// TU Supabase (REST) - escribe con la secret (service_role)
// ============================================================

function sbHeaders_() {
  const secret = PropertiesService.getScriptProperties().getProperty(PROP_DEST_SECRET);
  if (!secret || secret === 'PEGAR_SB_SECRET_ACA') {
    throw new Error('Falta la secret. Corre setSecrets una vez.');
  }
  return { apikey: secret, authorization: 'Bearer ' + secret };
}

/** Upsert de filas. mode: 'ignore' (no pisa) | 'merge' (actualiza). */
function sbUpsert_(table, rows, onConflict, mode) {
  if (!rows.length) return;
  const resolution = mode === 'merge' ? 'merge-duplicates' : 'ignore-duplicates';
  const url = CONFIG.DEST_URL + '/rest/v1/' + table
    + (onConflict ? '?on_conflict=' + onConflict : '');
  // en tandas de 500 para no mandar payloads gigantes
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: Object.assign(sbHeaders_(), { Prefer: 'resolution=' + resolution + ',return=minimal' }),
      payload: JSON.stringify(chunk),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 300) throw new Error('Supabase ' + table + ': ' + res.getContentText());
  }
}

function sbGet_(pathQuery) {
  const res = UrlFetchApp.fetch(CONFIG.DEST_URL + '/rest/v1/' + pathQuery, {
    headers: sbHeaders_(),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase GET ' + pathQuery + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

function sbRpc_(fn) {
  const res = UrlFetchApp.fetch(CONFIG.DEST_URL + '/rest/v1/rpc/' + fn, {
    method: 'post',
    contentType: 'application/json',
    headers: sbHeaders_(),
    payload: '{}',
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase RPC ' + fn + ': ' + res.getContentText());
}

// ============================================================
// SYNC CHECK-INS (shape conocido)
// ============================================================

function checkinRow_(c) {
  const user = c.user || {};
  const mem = c.membership || {};
  return {
    id: c.id,
    check_in_time: c.checkInTime || null,
    check_out_time: c.checkOutTime || null,
    status: c.status || null,
    user_id: c.userId || user.id || null,
    user_name: user.name || null,
    user_email: user.email || null,
    membership_id: c.membershipId || null,
    membership_duration_days: mem.durationDays != null ? mem.durationDays : null,
    branch_id: c.branchId || null,
    activity_type: c.activityType || null,
    created_at: c.createdAt || null,
    updated_at: c.updatedAt || null,
    service_id: c.serviceId || null,
    raw: c,
  };
}

function syncCheckins() {
  const token = getAccessToken_();
  const serviceId = getServiceId_(token);

  // desde el ultimo check-in guardado, o desde BACKFILL_START si esta vacio
  const last = sbGet_('check_ins?select=check_in_time&order=check_in_time.desc&limit=1');
  const startIso = last.length ? last[0].check_in_time : CONFIG.BACKFILL_START;
  const endIso = new Date().toISOString();

  let offset = 0, total = 0;
  while (true) {
    const qs = '?limit=' + CONFIG.PAGE_SIZE + '&offset=' + offset
      + '&startDate=' + encodeURIComponent(startIso)
      + '&endDate=' + encodeURIComponent(endIso);
    const page = pfGet_('/checkins/service/' + serviceId + qs, token);
    if (page.length) {
      sbUpsert_('check_ins', page.map(checkinRow_), 'id', 'ignore');
      total += page.length;
    }
    if (page.length < CONFIG.PAGE_SIZE) break;
    offset += CONFIG.PAGE_SIZE;
  }
  Logger.log('Check-ins procesados: ' + total);
  return total;
}

// ============================================================
// SYNC MEMBERS (shape confirmado con dumpMembershipShape)
// ============================================================

// Mapeo del objeto /memberships/service/{sid}:
//   id            -> id del registro de membresia (PK, unico)
//   userId        -> UUID de la persona (clave de cruce con check_ins)
//   status        -> ACTIVE/... (crudo). "Vencido" se deriva de endDate < hoy.
//   endDate       -> vencimiento
//   membershipPlan.name -> plan (null si no tiene plan asignado)
//   user.{name,email,phone} -> nombre/email/telefono
function memberRow_(m) {
  const u = m.user || {};
  const plan = m.membershipPlan || {};
  return {
    id: m.id,
    user_id: m.userId || u.id || null,
    nombre: u.name || null,
    email: u.email || null,
    telefono: u.phone || null,
    plan: plan.name || null,
    estado: m.status || null,
    vencimiento: m.endDate || null,
    verificado: null,            // el "Sin verificar" del UI no viene en este objeto
    raw: m,
  };
}

function dumpMembershipShape() {
  const token = getAccessToken_();
  const serviceId = getServiceId_(token);
  const data = pfGet_('/memberships/service/' + serviceId, token);
  const arr = Array.isArray(data) ? data : (data.items || data.data || []);
  Logger.log('Total socios: ' + arr.length);
  Logger.log('PRIMER OBJETO:\n' + JSON.stringify(arr[0], null, 2));
}

function syncMembers() {
  const token = getAccessToken_();
  const serviceId = getServiceId_(token);
  const data = pfGet_('/memberships/service/' + serviceId, token);
  const arr = Array.isArray(data) ? data : (data.items || data.data || []);
  const rows = arr.map(memberRow_).filter(function (r) { return r.id; });
  sbUpsert_('alumnos_pulsoflow', rows, 'id', 'merge');
  Logger.log('Socios procesados: ' + rows.length);
  return rows.length;
}

// ============================================================
// TRACKING + DAILY
// ============================================================

function rebuildTracking() {
  sbRpc_('rebuild_alumnos_tracking');
  Logger.log('alumnos_tracking reconstruida.');
}

function log_(runId, pipeline, nivel, mensaje, contexto) {
  try {
    sbUpsert_('pipeline_logs',
      [{ run_id: runId, pipeline: pipeline, nivel: nivel, mensaje: mensaje, contexto: contexto || null }],
      null, 'merge');
  } catch (e) { Logger.log('No se pudo loguear: ' + e); }
}

function runDaily() {
  const runId = Utilities.getUuid();
  const errores = [];
  const pasos = [
    ['syncCheckins', syncCheckins],
    ['syncMembers', syncMembers],
    ['rebuildTracking', rebuildTracking],
  ];
  pasos.forEach(function (p) {
    try {
      p[1]();
      log_(runId, p[0], 'info', 'ok');
    } catch (e) {
      errores.push(p[0] + ': ' + e.message);
      log_(runId, p[0], 'error', e.message);
    }
  });
  if (errores.length) {
    MailApp.sendEmail(CONFIG.EMAIL, 'ZAC pipeline - errores ' + new Date().toLocaleDateString(),
      errores.join('\n'));
  }
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'runDaily'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runDaily').timeBased().atHour(3).everyDays(1).create();
  Logger.log('Trigger instalado (3am hora del proyecto). Verifica el huso: '
    + 'Config del proyecto > America/Argentina/Buenos_Aires.');
}

