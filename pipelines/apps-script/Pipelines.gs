/**
 * ZAC GYM — Todos los pipelines, en un solo archivo.
 *
 * Antes vivian en cuatro: Code.gs, DiasEntrenamiento.gs, SheetIds.gs y
 * SemanaRutina.gs. Cada uno traia su propio cliente de Supabase porque se
 * escribieron para andar sueltos, y quedaron quince funciones haciendo lo mismo
 * y la URL escrita en cinco lugares. Aca hay un solo nucleo y todos lo usan.
 *
 * ORDEN, que lo fijan las dependencias:
 *
 *   sheetIds        Drive          -> alumnos.sheet_id
 *   syncCheckins    PulsoFlow      -> check_ins
 *   syncMembers     PulsoFlow      -> alumnos_pulsoflow
 *   dias            planillas      -> dias_entrenamiento
 *   rebuildTracking los 3 de arriba-> alumnos_tracking
 *   semanaRutina    planillas      -> alumnos.rutina_semana
 *
 * `dias` va antes de `rebuildTracking` y no es opcional: rebuild hace un
 * left join contra dias_entrenamiento y copia de ahi los dias Y el sheet_id.
 *
 * PUESTA EN MARCHA: ver instalarTodo() al final.
 */

const CONFIG = {
  EMAIL: 'diegojp2005@gmail.com',

  // --- Origen: Supabase de PulsoFlow (solo para loguearse) + su API ---
  PF_AUTH_URL: 'https://qsfxuyytmowwfszdonjs.supabase.co',
  PF_ANON_KEY: 'sb_publishable_CJD4oK4KclJ4HLCuruSrEQ_YOZFV14B',
  API_BASE: 'https://api.pulsoflow.app',

  // --- Destino: nuestro Supabase. La secret va en Script Properties. ---
  SUPA_URL: 'https://lrjqasglgmcxntuwamow.supabase.co',

  PAGE_SIZE: 200,
  BACKFILL_START: '2026-01-01T00:00:00.000Z',

  TZ: 'America/Argentina/Buenos_Aires',
  // El gimnasio esta cerrado de noche: no hay check-ins que traer.
  HORA_DESDE: 5,
  HORA_HASTA: 23,
};

// Pegar aca el codigo de 6 digitos, solo para el alta de sesion.
const OTP_CODE_INPUT = 'PEGAR_CODIGO_ACA';

const PROP_REFRESH_TOKEN = 'PULSOFLOW_REFRESH_TOKEN';
const PROP_SECRET = 'DEST_SUPABASE_SECRET';

/**
 * Correr UNA vez. La key tiene que ser la LEGACY service_role (un JWT largo
 * "eyJ..."): la sb_secret_... la bloquea Supabase cuando la llamada sale de
 * Apps Script. Esta en Settings > API Keys > Legacy API keys > service_role.
 * Pegala abajo, corre la funcion, y despues borra el valor de aca.
 */
function setSecrets() {
  PropertiesService.getScriptProperties().setProperty(PROP_SECRET, 'PEGAR_SERVICE_ROLE_JWT_ACA');
  Logger.log('Secret guardada. Borra el valor del codigo por seguridad.');
}

// ============================================================
// NUCLEO: Supabase
// ============================================================

function supaHeaders_() {
  // Copiar del panel se trae espacios y saltos de linea que no se ven, y
  // Supabase contesta "Invalid API key" sin decir por que.
  const cruda = PropertiesService.getScriptProperties().getProperty(PROP_SECRET) || '';
  const secret = cruda.replace(/\s+/g, '');
  if (!secret || secret.indexOf('PEGAR_') === 0) {
    throw new Error('Falta la secret. Corre setSecrets una vez.');
  }
  if (secret.indexOf('eyJ') !== 0) {
    throw new Error('La secret no es un JWT legacy: arranca con "' + secret.slice(0, 3) + '".');
  }
  return { apikey: secret, authorization: 'Bearer ' + secret };
}

function supaGet_(pathQuery) {
  const res = UrlFetchApp.fetch(CONFIG.SUPA_URL + '/rest/v1/' + pathQuery,
    { headers: supaHeaders_(), muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase GET ' + pathQuery + ': ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

/** Upsert de filas. mode: 'ignore' (no pisa) | 'merge' (actualiza). */
function supaUpsert_(table, rows, onConflict, mode) {
  if (!rows.length) return;
  const resolution = mode === 'merge' ? 'merge-duplicates' : 'ignore-duplicates';
  const url = CONFIG.SUPA_URL + '/rest/v1/' + table + (onConflict ? '?on_conflict=' + onConflict : '');
  // De a 500 para no mandar payloads gigantes.
  for (let i = 0; i < rows.length; i += 500) {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: Object.assign(supaHeaders_(), { Prefer: 'resolution=' + resolution + ',return=minimal' }),
      payload: JSON.stringify(rows.slice(i, i + 500)),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 300) throw new Error('Supabase ' + table + ': ' + res.getContentText());
  }
}

/**
 * Un PATCH sobre las filas que matchean el filtro. Un upsert no sirve para
 * esto: mandaria la fila entera y pisaria con null todo lo que no viaje.
 */
function supaPatch_(table, filtro, cambios) {
  const res = UrlFetchApp.fetch(CONFIG.SUPA_URL + '/rest/v1/' + table + '?' + filtro, {
    method: 'patch',
    contentType: 'application/json',
    headers: Object.assign(supaHeaders_(), { Prefer: 'return=minimal' }),
    payload: JSON.stringify(cambios),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase PATCH ' + table + ': ' + res.getContentText());
  }
}

function supaRpc_(fn) {
  const res = UrlFetchApp.fetch(CONFIG.SUPA_URL + '/rest/v1/rpc/' + fn, {
    method: 'post',
    contentType: 'application/json',
    headers: supaHeaders_(),
    payload: '{}',
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase RPC ' + fn + ': ' + res.getContentText());
}

/** Deja la corrida en pipeline_logs. Nunca tira: un log roto no frena nada. */
function supaLog_(runId, pipeline, nivel, mensaje, contexto) {
  try {
    supaUpsert_('pipeline_logs', [{
      run_id: runId, pipeline: pipeline, nivel: nivel,
      mensaje: mensaje, contexto: contexto || null,
    }], null, 'merge');
  } catch (e) {
    Logger.log('No se pudo loguear: ' + e);
  }
}

// ============================================================
// NUCLEO: texto
// ============================================================

/** Sin acentos, sin puntuacion, en minuscula. */
function norm_(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normEmail_(v) {
  return String(v || '').trim().toLowerCase();
}

const hoyArg_ = () => Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');

// ==========================================================
// PULSOFLOW: sesion y API
// ==========================================================

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


// ==========================================================
// PIPELINE 1 — sheetIds: Drive -> alumnos.sheet_id
// ==========================================================

const SIDS = {
  SUFIJO: ' - Rutina',
  CARPETA_ARCHIVADOS: 'Usuarios archivados',
  SUPA_URL: 'https://lrjqasglgmcxntuwamow.supabase.co',
  // Palabras que sacan a un archivo del barrido, este donde este. Mover la
  // rutina vieja a "Usuarios archivados" sigue siendo lo mejor, pero renombrarla
  // es lo que sale natural y no siempre alcanza: "Fulano - Rutina (archivado)"
  // conserva "Rutina", asi que resolvia al mismo alumno y chocaba con la nueva.
  IGNORAR: ['archivad', 'no usar', 'descartar', 'obsolet'],
  MAX_RUNTIME_MS: 4.5 * 60 * 1000, // corta antes del tope duro de 6 min
  HORA_TRIGGER: 2, // una hora antes que runDaily
};

/**
 * El nombre del alumno adentro del nombre del archivo.
 *
 * Cortar por " - Rutina" a secas no alcanza: hay archivos que se llaman
 * "Fulano- Rutina" sin el espacio, y otros que ni siquiera terminan asi
 * ("Fulano (nueva rutina)"). Los dos existen y quedaban huerfanos.
 *
 * Tambien saca los parentesis, que se usan para anotaciones como "(nueva)".
 * Lo que no toca es el texto suelto al final —"Fulano TENGO QUE PASAR LOS
 * DATOS"—: recortar palabra por palabra hasta que enganche podria pegarle al
 * alumno equivocado, y ese nombre lo tiene que arreglar una persona en Drive.
 */
function sidsSoloNombre_(titulo, sacarParentesis) {
  let t = String(titulo);
  // Los parentesis, cuando se sacan, van primero: en "Fulano (nueva rutina)" el
  // corte por "rutina" dispararia adentro del parentesis y dejaria "Fulano (nueva".
  if (sacarParentesis) t = t.replace(/\([^)]*\)/g, ' ');
  return t
    .replace(/[-–—]?\s*rutina.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Los alumnos indexados por como puede venir escrito el nombre del archivo.
 *
 * Se indexa en los dos ordenes porque los archivos estan nombrados "Apellido,
 * Nombre - Rutina" pero no todos: hay unos cuantos al reves. Un nombre que cae
 * en dos alumnos distintos se saca del indice —no se puede decidir— y se
 * resuelve por mail o queda avisado.
 */
function sidsIndexar_(alumnos) {
  const porNombre = {};
  const ambiguos = {};
  const porMail = {};

  alumnos.forEach(function (a) {
    const ap = norm_(a.apellido);
    const no = norm_(a.nombre);
    [ap + ' ' + no, no + ' ' + ap].forEach(function (clave) {
      if (clave.trim() === '') return;
      if (porNombre[clave] && porNombre[clave].id !== a.id) ambiguos[clave] = true;
      else porNombre[clave] = a;
    });
    if (a.email) {
      const mail = String(a.email).trim().toLowerCase();
      // Un mail compartido entre familiares no identifica a nadie.
      if (porMail[mail] && porMail[mail].id !== a.id) ambiguos['mail:' + mail] = true;
      else porMail[mail] = a;
    }
  });

  Object.keys(ambiguos).forEach(function (clave) {
    if (clave.indexOf('mail:') === 0) delete porMail[clave.slice(5)];
    else delete porNombre[clave];
  });

  return { porNombre: porNombre, porMail: porMail };
}

/**
 * A quien pertenece el archivo.
 *
 * Primero el nombre, que es la señal del archivo mismo. Si no engancha, con que
 * mails esta compartido: cuesta una llamada mas a Drive, asi que solo se paga
 * cuando el nombre fallo.
 */
function sidsIdentificar_(archivo, indice) {
  const titulo = archivo.getName();

  const plano = norm_(titulo);
  for (let j = 0; j < SIDS.IGNORAR.length; j++) {
    if (plano.indexOf(SIDS.IGNORAR[j]) !== -1) {
      return { alumno: null, como: 'ignorado por decir "' + SIDS.IGNORAR[j] + '"' };
    }
  }
  // Con los parentesis primero y sin ellos despues. El orden importa: hay tres
  // alumnos cuyo nombre ES el parentesis —"Guillermo (Hijo)", "Hernan (Padre)",
  // "Mariano (grande)"—, cada uno con un homonimo sin el. Sacandolos de entrada,
  // padre e hijo se funden en uno y ninguno de los dos recibe su sheet_id.
  // Sacandolos despues sigue limpiando las anotaciones tipo "(nueva)".
  for (let i = 0; i < 2; i++) {
    const a = indice.porNombre[norm_(sidsSoloNombre_(titulo, i === 1))];
    if (a) return { alumno: a, como: 'nombre' };
  }

  const mails = {};
  try {
    archivo.getEditors().forEach(function (u) { mails[u.getEmail().toLowerCase()] = true; });
    archivo.getViewers().forEach(function (u) { mails[u.getEmail().toLowerCase()] = true; });
    const dueno = archivo.getOwner();
    if (dueno) delete mails[dueno.getEmail().toLowerCase()];
  } catch (e) {
    return { alumno: null, como: 'sin permiso para ver con quien esta compartido' };
  }

  const candidatos = Object.keys(mails)
    .map(function (m) { return indice.porMail[m]; })
    .filter(Boolean);
  // Dos alumnos distintos en el mismo archivo: no se puede elegir.
  const unicos = {};
  candidatos.forEach(function (a) { unicos[a.id] = a; });
  const ids = Object.keys(unicos);
  if (ids.length === 1) return { alumno: unicos[ids[0]], como: 'mail compartido' };

  return { alumno: null, como: ids.length > 1 ? 'el archivo apunta a varios alumnos' : 'sin match' };
}

/** El iterador sin continuation token: la medicion lleva el suyo aparte. */
function sidsArchivosTodos_() {
  let query = 'title contains "' + SIDS.SUFIJO.trim() + '"';
  const archivados = DriveApp.getFoldersByName(SIDS.CARPETA_ARCHIVADOS);
  if (archivados.hasNext()) {
    query += " and not '" + archivados.next().getId() + "' in parents";
  }
  return DriveApp.searchFiles(query);
}

/**
 * Barre Drive y le pone el sheet_id a cada alumno.
 *
 * Drive manda: si el alumno ya tenia otro id y aparece un archivo con su
 * nombre, se pisa. Un archivo que no engancha con nadie no crea nada, solo
 * queda avisado en `pipeline_logs`.
 */
/**
 * FASE 1: barre Drive entero y arma el mapa alumno -> archivos que lo reclaman.
 *
 * Se junta todo antes de decidir nada. Decidir sobre la marcha era el bug: el
 * primer archivo de un alumno con dos rutinas ya se escribia, y recien el
 * segundo delataba el duplicado. Pasaba de "gana el ultimo" a "gana el primero",
 * las dos igual de arbitrarias.
 *
 * No se reanuda entre corridas a proposito: un mapa a medias no sirve para
 * decidir, y el barrido entero tarda unos 15 segundos contra los 6 minutos que
 * da Apps Script. Si igual no alcanza, avisa y no escribe nada.
 */
function sidsRelevar_(indice) {
  const porAlumno = {};   // alumnoId -> { alumno, ids: [] }
  const huerfanos = [];
  const como = { nombre: 0, mail: 0 };
  const t0 = Date.now();
  const archivos = sidsArchivosTodos_();
  let vistos = 0;

  while (archivos.hasNext()) {
    if (Date.now() - t0 > SIDS.MAX_RUNTIME_MS) {
      return { incompleto: true, vistos: vistos, porAlumno: porAlumno, huerfanos: huerfanos, como: como };
    }
    const archivo = archivos.next();
    vistos++;
    const encontrado = sidsIdentificar_(archivo, indice);
    if (!encontrado.alumno) {
      huerfanos.push({ archivo: archivo.getName(), motivo: encontrado.como, id: archivo.getId() });
      continue;
    }
    const a = encontrado.alumno;
    if (encontrado.como === 'nombre') como.nombre++; else como.mail++;
    if (!porAlumno[a.id]) porAlumno[a.id] = { alumno: a, ids: [] };
    if (porAlumno[a.id].ids.indexOf(archivo.getId()) === -1) {
      porAlumno[a.id].ids.push(archivo.getId());
    }
  }
  return { incompleto: false, vistos: vistos, porAlumno: porAlumno, huerfanos: huerfanos, como: como };
}

/**
 * Barre Drive y le pone el sheet_id a cada alumno.
 *
 * Drive le gana a la base: si el alumno ya tenia otro id, se pisa. Pero entre
 * dos archivos de Drive no gana ninguno —son rutinas duplicadas y elegir una al
 * azar le manda la rutina de otro al alumno—, asi que esos quedan avisados y sin
 * tocar. Un archivo que no engancha con nadie tampoco crea nada.
 */
function syncSheetIds() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  const runId = Utilities.getUuid();

  try {
    const alumnos = supaGet_('alumnos?select=id,apellido,nombre,email,sheet_id');
    const relevo = sidsRelevar_(sidsIndexar_(alumnos));

    if (relevo.incompleto) {
      supaLog_(runId, 'SyncSheetsID', 'error', 'El barrido de Drive no termino, no se escribio nada',
        { archivos_vistos: relevo.vistos });
      Logger.log('sheetIds: barrido incompleto (' + relevo.vistos + ' archivos). No se escribio nada.');
      return;
    }

    const r = { puestos: 0, pisados: 0, iguales: 0, duplicados: 0, huerfanos: relevo.huerfanos.length };

    relevo.huerfanos.forEach(function (h) {
      supaLog_(runId, 'SyncSheetsID', 'warn', 'Rutina sin alumno: ' + h.motivo, { archivo: h.archivo, sheet_id: h.id });
    });

    Object.keys(relevo.porAlumno).forEach(function (alumnoId) {
      const entrada = relevo.porAlumno[alumnoId];
      const a = entrada.alumno;

      if (entrada.ids.length > 1) {
        r.duplicados++;
        supaLog_(runId, 'SyncSheetsID', 'warn', 'Tiene ' + entrada.ids.length + ' rutinas en Drive, no se toca ninguna',
          { alumno: a.apellido + ', ' + a.nombre, rutinas: entrada.ids });
        return;
      }

      const id = entrada.ids[0];
      if (a.sheet_id === id) { r.iguales++; return; }

      // El indice unico parcial de `alumnos.sheet_id` no deja que dos fichas
      // compartan la misma rutina: si choca, avisa en vez de romper la corrida.
      try {
        supaPatch_('alumnos', 'id=eq.' + a.id, { sheet_id: id });
      } catch (e) {
        supaLog_(runId, 'SyncSheetsID', 'error', 'No se pudo guardar el sheet_id: ' + e.message,
          { alumno: a.apellido + ', ' + a.nombre, sheet_id: id });
        return;
      }

      if (a.sheet_id) {
        r.pisados++;
        supaLog_(runId, 'SyncSheetsID', 'warn', 'Tenia otra rutina y se piso con la de Drive',
          { alumno: a.apellido + ', ' + a.nombre, antes: a.sheet_id, ahora: id });
      } else {
        r.puestos++;
      }
    });

    supaLog_(runId, 'SyncSheetsID', 'info', 'Listo', r);
    Logger.log('sheetIds: ' + JSON.stringify(r));
  } catch (e) {
    supaLog_(runId, 'SyncSheetsID', 'error', e.message, null);
    Logger.log('ERROR en syncSheetIds: ' + e.message + ' ' + e.stack);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cuanto tarda el barrido y que haria, sin escribir nada.
 *
 * Usa el mismo relevo en dos fases que `syncSheetIds`, asi que los numeros son
 * exactamente los que van a pasar cuando se habilite la escritura. Contar sobre
 * la marcha daba de mas: un alumno con dos rutinas figuraba como pisada Y como
 * duplicado, cuando en realidad no se le toca nada.
 */
function medirSheetIds() {
  const t0 = Date.now();
  const alumnos = supaGet_('alumnos?select=id,apellido,nombre,email,sheet_id');
  const indice = sidsIndexar_(alumnos);
  const msAlumnos = Date.now() - t0;

  const relevo = sidsRelevar_(indice);
  const seg = (Date.now() - t0) / 1000;

  const r = { iguales: 0, pondria: 0, pisaria: 0, duplicados: 0 };
  const ejemplos = [];
  Object.keys(relevo.porAlumno).forEach(function (id) {
    const e = relevo.porAlumno[id];
    const a = e.alumno;
    const quien = a.apellido + ', ' + a.nombre;
    if (e.ids.length > 1) {
      r.duplicados++;
      if (ejemplos.length < 40) ejemplos.push('DUPLICADO (' + e.ids.length + ') ' + quien + ': ' + e.ids.join(' y '));
    } else if (a.sheet_id === e.ids[0]) {
      r.iguales++;
    } else if (a.sheet_id) {
      r.pisaria++;
      if (ejemplos.length < 40) ejemplos.push('PISARIA ' + quien + ': ' + a.sheet_id + ' -> ' + e.ids[0]);
    } else {
      r.pondria++;
      if (ejemplos.length < 40) ejemplos.push('PONDRIA ' + quien + ' -> ' + e.ids[0]);
    }
  });
  relevo.huerfanos.forEach(function (h) {
    if (ejemplos.length < 40) ejemplos.push('SIN ALUMNO (' + h.motivo + '): ' + h.archivo);
  });

  Logger.log([
    '================ MEDICION ================',
    relevo.incompleto ? '*** BARRIDO INCOMPLETO: no alcanzo el tiempo ***' : '',
    'archivos "- Rutina" en Drive : ' + relevo.vistos,
    'tiempo total                 : ' + seg.toFixed(1) + 's',
    'de eso, leer alumnos         : ' + (msAlumnos / 1000).toFixed(1) + 's',
    'ritmo                        : ' + (relevo.vistos / seg).toFixed(1) + ' archivos/seg',
    '',
    'enganchan por nombre         : ' + relevo.como.nombre,
    'enganchan por mail           : ' + relevo.como.mail,
    'archivos sin alumno          : ' + relevo.huerfanos.length,
    '',
    'ALUMNOS alcanzados           : ' + Object.keys(relevo.porAlumno).length,
    '  ya tienen el id correcto   : ' + r.iguales,
    '  se les pondria el id       : ' + r.pondria,
    '  se les PISARIA otro id     : ' + r.pisaria,
    '  con 2+ rutinas, no se tocan: ' + r.duplicados,
    '',
    'NO se escribio nada en la base.',
    '',
    'Detalle:',
  ].concat(ejemplos).join('\n'));
  return r;
}


// ==========================================================
// PIPELINE 2 y 3 — syncCheckins y syncMembers: PulsoFlow -> Supabase
// ==========================================================

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
  const last = supaGet_('check_ins?select=check_in_time&order=check_in_time.desc&limit=1');
  const startIso = last.length ? last[0].check_in_time : CONFIG.BACKFILL_START;
  const endIso = new Date().toISOString();

  let offset = 0, total = 0;
  while (true) {
    const qs = '?limit=' + CONFIG.PAGE_SIZE + '&offset=' + offset
      + '&startDate=' + encodeURIComponent(startIso)
      + '&endDate=' + encodeURIComponent(endIso);
    const page = pfGet_('/checkins/service/' + serviceId + qs, token);
    if (page.length) {
      supaUpsert_('check_ins', page.map(checkinRow_), 'id', 'ignore');
      total += page.length;
    }
    if (page.length < CONFIG.PAGE_SIZE) break;
    offset += CONFIG.PAGE_SIZE;
  }
  Logger.log('Check-ins procesados: ' + total);
  return total;
}

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
  supaUpsert_('alumnos_pulsoflow', rows, 'id', 'merge');
  Logger.log('Socios procesados: ' + rows.length);
  return rows.length;
}


// ==========================================================
// PIPELINE 5 — rebuildTracking
// ==========================================================

function rebuildTracking() {
  supaRpc_('rebuild_alumnos_tracking');
  Logger.log('alumnos_tracking reconstruida.');
}

// ==========================================================
// PIPELINE 4 — dias: planillas -> dias_entrenamiento
// ==========================================================

const DIAS = {
  MAX_RUNTIME_MS: 5 * 60 * 1000, // corta antes del limite duro de 6 min
};

/**
 * Los alumnos a los que hay que contarles los dias: los de membresia ACTIVE.
 *
 * Antes eran los que tenian un check-in en los ultimos 14 dias, y el sheet_id
 * salia de la planilla "Control de usuarios" cruzando por mail. Las dos cosas
 * dejaban gente afuera: el filtro de 14 dias no es lo mismo que estar activo, y
 * un alumno que faltara en esa planilla quedaba invisible sin que nada fallara.
 * Hoy el sheet_id vive en alumnos.sheet_id, que sheetIds mantiene solo.
 */
function alumnosActivos_() {
  // ponytail: sin paginar. PostgREST corta en 1000 filas y hoy hay 231 activos;
  // si alguna vez se acerca, paginar como hace syncCheckins.
  return supaGet_('alumnos_cuenta?select=email,sheet_id'
    + '&estado_membresia=eq.ACTIVE&sheet_id=not.is.null&email=not.is.null');
}

// deadline (opcional): timestamp absoluto en ms para cortar. Si no se pasa
// (corrida suelta), usa su propio tope de 5 min. Dentro de runDaily se le pasa
// un deadline que reserva tiempo para rebuildTracking.
function syncDiasEntrenamiento(deadline) {
  const runId = Utilities.getUuid();
  const limit = deadline || (Date.now() + DIAS.MAX_RUNTIME_MS);

  const activos = alumnosActivos_();            // membresia ACTIVE, con planilla
  const yaGuardado = loadDiasState_();          // email -> sheet_last_modified (ISO)

  let procesados = 0, saltados = 0, errores = 0, pendientes = 0;

  for (let i = 0; i < activos.length; i++) {
    if (Date.now() > limit) {
      pendientes = activos.length - i;
      break;
    }
    const email = normEmail_(activos[i].email);
    const sheetId = activos[i].sheet_id;
    try {
      const driveMod = DriveApp.getFileById(sheetId).getLastUpdated();
      const prev = yaGuardado[email];
      if (prev && new Date(prev) >= driveMod) { saltados++; continue; } // no cambio

      const r = computeDias_(SpreadsheetApp.openById(sheetId));
      supaUpsert_('dias_entrenamiento', [{
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
      supaLog_(runId, 'SyncTrainingDays', 'error', e.message, { email: email });
    }
  }

  Logger.log('dias -> activos: ' + activos.length + ', procesados: ' + procesados
    + ', saltados (sin cambio): ' + saltados
    + ', errores: ' + errores + ', pendientes: ' + pendientes);
}

/**
 * Validador: proba UN alumno sin escribir en Supabase.
 * Cambia el email, corre esta funcion, mira el Log: hoja usada + dias contados.
 * Sirve para verificar que el conteo da bien antes de confiar en todas.
 */
function debugDiasUnAlumno() {
  const email = normEmail_('CAMBIAR_EMAIL_ACA@gmail.com');
  const fila = supaGet_('alumnos_cuenta?select=sheet_id&email=eq.' + encodeURIComponent(email))[0];
  const sheetId = fila && fila.sheet_id;
  if (!sheetId) { Logger.log('No hay sheet_id para ' + email + ' en alumnos.'); return; }
  const ss = SpreadsheetApp.openById(sheetId);
  const r = computeDias_(ss);
  Logger.log('email: ' + email + '\nsheet_id: ' + sheetId
    + '\nhoja usada: ' + r.hoja + '\nDIAS contados: ' + r.dias);
}

function loadDiasState_() {
  const rows = supaGet_('dias_entrenamiento?select=gmail,sheet_last_modified');
  const map = {};
  rows.forEach(function (r) { map[normEmail_(r.gmail)] = r.sheet_last_modified; });
  return map;
}

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

function normText_(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}


// ==========================================================
// PIPELINE 6 — semanaRutina: planillas -> alumnos.rutina_semana
// ==========================================================

const SEM = {
  SUPA_URL: 'https://lrjqasglgmcxntuwamow.supabase.co',
  API: 'https://sheets.googleapis.com/v4/spreadsheets/',
  // Entran los que entrenaron en el ultimo mes y los que tienen la cuota al dia.
  DIAS_ACTIVIDAD: 30,
  // La API de Sheets deja ~60 lecturas por minuto y por usuario. Con 10 en
  // paralelo cada 1,5s se pedian ~400: la mitad de las planillas volvia con 429.
  // Cinco cada 5 segundos son 60 por minuto justos.
  EN_PARALELO: 5,
  ESPERA_MS: 5000,
  REINTENTOS: 4,
  MAX_RUNTIME_MS: 4.5 * 60 * 1000,
  RETRASO_TRIGGER_MS: 60 * 1000,
  HORA_TRIGGER: 4,      // despues de runDaily
  // Donde vive la grilla. Se verifica contra la columna A antes de creerle.
  FILA_FECHAS: 7,
  FILA_ENCABEZADOS: 10,
};

const PROP_SEM_PENDIENTES = 'SEMANA_PENDIENTES';
const PROP_SEM_RESUMEN = 'SEMANA_RESUMEN';
/** El id del trigger `after()` que reanuda: se borra por id, no por funcion. */
const PROP_SEM_TRIGGER = 'SEMANA_TRIGGER';

/** Dos bloques visibles a la vez: la planilla quedo a medio actualizar. */
const SEM_REVISAR = 'Revisar';

/**
 * A quienes se les mira la planilla: los que entrenaron en el ultimo mes o
 * tienen la cuota al dia. Los que no entrenan hace rato no cambian de semana, y
 * leerles el archivo todos los dias es gastar cuota de Google al pedo.
 */
function semPoblacion_(todos) {
  let q = 'alumnos_cuenta?select=id,apellido,nombre,sheet_id&sheet_id=not.is.null';
  if (!todos) {
    const corte = new Date(Date.now() - SEM.DIAS_ACTIVIDAD * 86400000).toISOString();
    const hoy = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd');
    q += '&or=(ultima_actividad.gte.' + corte + ',vence.gte.' + hoy + ')';
  }
  return supaGet_(q);
}

/**
 * Una corrida sobre TODOS los que tienen planilla, no solo los del ultimo mes.
 *
 * Sirve para la primera carga, o cuando se quiere una foto completa. No cambia
 * el criterio diario: arma la lista entera y despues sigue el mismo camino, asi
 * que se reanuda igual y el trigger que quede instalado vuelve a mirar solo a
 * los activos.
 *
 * Son seis veces mas planillas, y cada una son dos viajes a la API de Sheets:
 * contar con varias pasadas.
 */
function semanaRutinaTodos() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_SEM_PENDIENTES)) {
    Logger.log('Hay una corrida a medio terminar. Corre reiniciarSemanaRutina primero.');
    return;
  }
  const lista = semPoblacion_(true).map(function (a) {
    return { id: a.id, sheet: a.sheet_id, quien: a.apellido + ', ' + a.nombre };
  });
  props.setProperty(PROP_SEM_PENDIENTES, JSON.stringify(lista));
  props.setProperty(PROP_SEM_RESUMEN, '{"leidos":0,"revisar":0,"sinFecha":0,"errores":0,"frenados":0}');
  Logger.log('Cargados ' + lista.length + ' alumnos. Arranca.');
  semanaRutina();
}

/** Una fecha serial de Sheets a "YYYY-MM-DD". Sheets cuenta desde 1899-12-30. */
function semFecha_(celda) {
  if (!celda) return null;
  const tipo = celda.effectiveFormat && celda.effectiveFormat.numberFormat
    && celda.effectiveFormat.numberFormat.type;
  const valor = celda.effectiveValue && celda.effectiveValue.numberValue;
  if ((tipo === 'DATE' || tipo === 'DATE_TIME') && valor !== undefined) {
    const d = new Date((valor - 25569) * 86400000);
    return Utilities.formatDate(
      new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), 'GMT', 'yyyy-MM-dd');
  }
  return null;
}

const semTexto_ = (c) => String(
  (c && (c.formattedValue || (c.effectiveValue && c.effectiveValue.stringValue))) || '')
  .trim().toLowerCase();

/**
 * Igual que semTexto_ pero sin acentos.
 *
 * La celda dice "DIA" con tilde, asi que comparar en minuscula no alcanza:
 * "dia" nunca es igual a "dia". Los encabezados SERIES y PESO no llevan, pero
 * se normalizan igual por las dudas.
 */
const semPlano_ = (c) => semTexto_(c).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Un 429 o un 5xx no dicen nada del alumno: la lectura ni se intento. */
const semTransitorio_ = (res) => {
  const c = res.getResponseCode();
  return c === 429 || c >= 500;
};

/** Pide de a poco en paralelo, con reintentos: la API de Sheets tira 429 facil. */
function semTraer_(pedidos) {
  const salida = [];
  for (let i = 0; i < pedidos.length; i += SEM.EN_PARALELO) {
    const tanda = pedidos.slice(i, i + SEM.EN_PARALELO);
    let resp = null;
    for (let r = 0; r < SEM.REINTENTOS; r++) {
      try {
        resp = UrlFetchApp.fetchAll(tanda);
        const frenado = resp.some(function (x) {
          const c = x.getResponseCode();
          return c === 429 || c >= 500;
        });
        if (frenado && r < SEM.REINTENTOS - 1) { Utilities.sleep(3000 * (r + 1)); continue; }
        break;
      } catch (e) {
        if (r < SEM.REINTENTOS - 1) Utilities.sleep(3000 * (r + 1));
        else resp = tanda.map(function () {
          return { getResponseCode: function () { return 500; },
                   getContentText: function () { return String(e); } };
        });
      }
    }
    resp.forEach(function (x) { salida.push(x); });
    if (i + SEM.EN_PARALELO < pedidos.length) Utilities.sleep(SEM.ESPERA_MS);
  }
  return salida;
}

/**
 * La semana abierta, a partir de la grilla ya traida.
 *
 * El bloque activo es el primer "SERIES" cuya columna no este oculta: es el
 * mismo criterio que usa el script de rutinas para decidir donde escribe. La
 * fecha esta tres filas mas arriba, sobre la columna del bloque.
 *
 * Dos bloques visibles no se resuelven eligiendo uno: la planilla quedo a medio
 * actualizar y cualquiera de los dos que se tome puede ser el equivocado.
 */
function semLeerGrilla_(datosHoja) {
  if (!datosHoja || datosHoja.length < 3) return { estado: 'no se pudo leer la grilla' };

  const colA = ((datosHoja[0].rowData || []).map(function (f) {
    return f.values && f.values[0] ? semPlano_(f.values[0]) : '';
  }));
  // La grilla se da por sentada en las filas 7 y 10, pero se verifica: si "DIA"
  // no esta donde tiene que estar, la planilla tiene otro formato y leer esas
  // filas daria una fecha de cualquier lado.
  const dondeDia = colA.indexOf('dia') + 1;
  if (dondeDia !== SEM.FILA_ENCABEZADOS) {
    return { estado: 'formato distinto: DIA en la fila ' + (dondeDia || '?') };
  }

  const fechas = datosHoja[1];
  const encabezados = datosHoja[2];
  const meta = fechas.columnMetadata || encabezados.columnMetadata || [];
  const celdasFecha = (fechas.rowData && fechas.rowData[0] && fechas.rowData[0].values) || [];
  const celdasEnc = (encabezados.rowData && encabezados.rowData[0] && encabezados.rowData[0].values) || [];

  let series = [], peso = [];
  for (let i = 0; i < Math.max(celdasEnc.length, meta.length); i++) {
    if (meta[i] && meta[i].hiddenByUser) continue;
    const t = semPlano_(celdasEnc[i]);
    if (t === 'series') series.push(i);
    else if (t === 'peso') peso.push(i);
  }

  if (series.length > 1 || (series.length === 0 && peso.length > 1)) {
    return { estado: SEM_REVISAR };
  }
  const col = series.length === 1 ? series[0] : (peso.length === 1 ? peso[0] : -1);
  if (col === -1) return { estado: 'sin bloque visible' };

  const fecha = semFecha_(celdasFecha[col]);
  return fecha ? { fecha: fecha } : { estado: 'el bloque visible no tiene fecha' };
}

/**
 * Lee la semana de cada alumno y la guarda.
 *
 * Se reanuda entre corridas: son cientos de planillas y cada una son dos
 * viajes a la API de Sheets, uno para saber que hoja mirar y otro para la
 * grilla. La lista de pendientes se arma una vez y se va consumiendo.
 */
function semanaRutina() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  const props = PropertiesService.getScriptProperties();
  const t0 = Date.now();
  const runId = Utilities.getUuid();

  try {
    let pendientes = JSON.parse(props.getProperty(PROP_SEM_PENDIENTES) || 'null');
    const r = JSON.parse(props.getProperty(PROP_SEM_RESUMEN)
      || '{"leidos":0,"revisar":0,"sinFecha":0,"errores":0,"frenados":0}');

    if (pendientes === null) {
      pendientes = semPoblacion_(false).map(function (a) {
        return { id: a.id, sheet: a.sheet_id, quien: a.apellido + ', ' + a.nombre };
      });
      Logger.log('semanaRutina: ' + pendientes.length + ' alumnos por leer.');
    }

    const token = ScriptApp.getOAuthToken();
    const cab = { Authorization: 'Bearer ' + token };

    while (pendientes.length && Date.now() - t0 < SEM.MAX_RUNTIME_MS) {
      const lote = pendientes.splice(0, SEM.EN_PARALELO * 3);
      // Los que la API no quiso atender vuelven al final de la cola: el problema
      // es la cuota, no ellos, y escribirles un error seria mentir.
      const devueltos = [];

      // Vuelta 1: que hojas tiene cada planilla, para quedarse con la
      // Entrenamiento de numero mas alto.
      const hojas = semTraer_(lote.map(function (a) {
        return { url: SEM.API + a.sheet + '?fields=sheets(properties(title))',
                 headers: cab, muteHttpExceptions: true };
      }));

      const conHoja = [];
      hojas.forEach(function (res, i) {
        const a = lote[i];
        if (semTransitorio_(res)) { devueltos.push(a); return; }
        if (res.getResponseCode() !== 200) {
          r.errores++;
          supaPatch_('alumnos', 'id=eq.' + a.id, { rutina_semana: null, rutina_estado: 'no se pudo abrir la planilla',
                            rutina_leida_en: new Date().toISOString() });
          return;
        }
        const titulos = (JSON.parse(res.getContentText()).sheets || [])
          .map(function (s) { return s.properties.title; });
        const cand = titulos
          .map(function (t) {
            const m = t.match(/^entrenamiento(\d*)$/i);
            return m ? { t: t, n: m[1] ? parseInt(m[1], 10) : -1 } : null;
          })
          .filter(Boolean)
          .sort(function (x, y) { return y.n - x.n; });
        if (!cand.length) {
          r.errores++;
          supaPatch_('alumnos', 'id=eq.' + a.id, { rutina_semana: null, rutina_estado: 'sin hoja Entrenamiento',
                            rutina_leida_en: new Date().toISOString() });
          return;
        }
        conHoja.push({ a: a, hoja: cand[0].t });
      });

      if (!conHoja.length) continue;

      // Vuelta 2: la columna A para ubicar "DIA", y las filas de fechas y
      // encabezados. Tres rangos en un solo pedido.
      const grillas = semTraer_(conHoja.map(function (x) {
        const rangos = ['A1:A20', SEM.FILA_FECHAS + ':' + SEM.FILA_FECHAS,
                        SEM.FILA_ENCABEZADOS + ':' + SEM.FILA_ENCABEZADOS]
          .map(function (rg) {
            return 'ranges=' + encodeURIComponent("'" + x.hoja + "'!" + rg);
          }).join('&');
        return {
          url: SEM.API + x.a.sheet + '?' + rangos + '&includeGridData=true'
             + '&fields=sheets(data(columnMetadata(hiddenByUser),rowData(values('
             + 'effectiveValue,formattedValue,effectiveFormat(numberFormat(type))))))',
          headers: cab, muteHttpExceptions: true,
        };
      }));

      grillas.forEach(function (res, i) {
        const x = conHoja[i];
        if (semTransitorio_(res)) { devueltos.push(x.a); return; }
        let leido;
        if (res.getResponseCode() !== 200) {
          leido = { estado: 'error ' + res.getResponseCode() + ' al leer la grilla' };
        } else {
          const hojas2 = JSON.parse(res.getContentText()).sheets || [];
          leido = semLeerGrilla_(hojas2.length ? hojas2[0].data : null);
        }

        if (leido.fecha) r.leidos++;
        else if (leido.estado === SEM_REVISAR) r.revisar++;
        else r.sinFecha++;

        try {
          supaPatch_('alumnos', 'id=eq.' + x.a.id, {
            rutina_semana: leido.fecha || null,
            rutina_estado: leido.fecha ? null : leido.estado,
            rutina_leida_en: new Date().toISOString(),
          });
        } catch (e) {
          r.errores++;
          supaLog_(runId, 'SyncTrainingDate', 'error', 'No se pudo guardar: ' + e.message, { alumno: x.a.quien });
        }
      });

      if (devueltos.length) {
        r.frenados += devueltos.length;
        devueltos.forEach(function (a) { pendientes.push(a); });
        // Si la tanda entera reboto, la cuota esta agotada: seguir pidiendo solo
        // gasta el tiempo de la corrida contra 429.
        if (devueltos.length >= lote.length) {
          Logger.log('semanaRutina: cuota agotada, corto y sigo despues.');
          break;
        }
      }
    }

    if (pendientes.length) {
      props.setProperty(PROP_SEM_PENDIENTES, JSON.stringify(pendientes));
      props.setProperty(PROP_SEM_RESUMEN, JSON.stringify(r));
      semBorrarTriggers_();
      const sigue = ScriptApp.newTrigger('semanaRutina')
        .timeBased().after(SEM.RETRASO_TRIGGER_MS).create();
      props.setProperty(PROP_SEM_TRIGGER, sigue.getUniqueId());
      Logger.log('semanaRutina: quedan ' + pendientes.length + '. ' + JSON.stringify(r));
      return;
    }

    props.deleteProperty(PROP_SEM_PENDIENTES);
    props.deleteProperty(PROP_SEM_RESUMEN);
    semBorrarTriggers_();
    supaLog_(runId, 'SyncTrainingDate', 'info', 'Listo', r);
    Logger.log('semanaRutina: ' + JSON.stringify(r));
  } catch (e) {
    supaLog_(runId, 'SyncTrainingDate', 'error', e.message, null);
    Logger.log('ERROR en semanaRutina: ' + e.message + ' ' + e.stack);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Borra el trigger de reanudacion, y solo ese.
 *
 * Filtrar por nombre de funcion se llevaba puestos los cuatro triggers diarios
 * de `TRIGGERS`, que apuntan a la misma `semanaRutina`: la primera corrida
 * dejaba al pipeline sin horario y no volvia a correr hasta que alguien
 * ejecutara `instalarTodo()` a mano. Apps Script no distingue un `after()` de
 * un `everyDays()`, asi que el id del one-shot se guarda al crearlo.
 */
function semBorrarTriggers_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP_SEM_TRIGGER);
  if (!id) return;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getUniqueId() === id) ScriptApp.deleteTrigger(t);
  });
  props.deleteProperty(PROP_SEM_TRIGGER);
}

/** Borra la lista de pendientes para volver a empezar de cero. */
function reiniciarSemanaRutina() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_SEM_PENDIENTES);
  props.deleteProperty(PROP_SEM_RESUMEN);
  semBorrarTriggers_();
  Logger.log('Listo, la proxima corrida arranca de cero.');
}

/**
 * Un solo alumno, mostrando todo lo que leyo y SIN guardar nada.
 *
 * Correr esto antes que nada: dice que hoja eligio, en que fila encontro DIA,
 * que columnas vio visibles y que fecha saco, para poder abrir la planilla al
 * lado y comparar.
 */
function probarUnAlumno() {
  const APELLIDO = 'CAMBIAR_APELLIDO_ACA';

  const alumnos = supaGet_('alumnos?select=id,apellido,nombre,sheet_id&sheet_id=not.is.null'
    + '&apellido=ilike.' + encodeURIComponent('%' + APELLIDO + '%') + '&limit=1');
  if (!alumnos.length) { Logger.log('No encontre a nadie con ese apellido.'); return; }
  const a = alumnos[0];
  const cab = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };

  const meta = UrlFetchApp.fetch(SEM.API + a.sheet_id + '?fields=sheets(properties(title))',
    { headers: cab, muteHttpExceptions: true });
  if (meta.getResponseCode() !== 200) {
    Logger.log('No se pudo abrir: ' + meta.getContentText().slice(0, 200)); return;
  }
  const titulos = (JSON.parse(meta.getContentText()).sheets || [])
    .map(function (s) { return s.properties.title; });
  const cand = titulos
    .map(function (t) { const m = t.match(/^entrenamiento(\d*)$/i);
                        return m ? { t: t, n: m[1] ? parseInt(m[1], 10) : -1 } : null; })
    .filter(Boolean).sort(function (x, y) { return y.n - x.n; });

  const lineas = ['alumno : ' + a.apellido + ', ' + a.nombre,
                  'hojas  : ' + titulos.join(' | '),
                  'elegida: ' + (cand.length ? cand[0].t : 'NINGUNA')];
  if (!cand.length) { Logger.log(lineas.join('\n')); return; }

  const rangos = ['A1:A20', SEM.FILA_FECHAS + ':' + SEM.FILA_FECHAS,
                  SEM.FILA_ENCABEZADOS + ':' + SEM.FILA_ENCABEZADOS]
    .map(function (rg) { return 'ranges=' + encodeURIComponent("'" + cand[0].t + "'!" + rg); })
    .join('&');
  const res = UrlFetchApp.fetch(SEM.API + a.sheet_id + '?' + rangos + '&includeGridData=true'
    + '&fields=sheets(data(columnMetadata(hiddenByUser),rowData(values('
    + 'effectiveValue,formattedValue,effectiveFormat(numberFormat(type))))))',
    { headers: cab, muteHttpExceptions: true });

  const datos = (JSON.parse(res.getContentText()).sheets || [])[0].data;
  const colA = (datos[0].rowData || []).map(function (f) {
    return f.values && f.values[0] ? semPlano_(f.values[0]) : ''; });
  lineas.push('DIA en fila: ' + (colA.indexOf('dia') + 1) + '  (se espera ' + SEM.FILA_ENCABEZADOS + ')');

  const meta2 = datos[1].columnMetadata || datos[2].columnMetadata || [];
  const enc = (datos[2].rowData && datos[2].rowData[0] && datos[2].rowData[0].values) || [];
  const fec = (datos[1].rowData && datos[1].rowData[0] && datos[1].rowData[0].values) || [];
  // Solo las visibles: las ocultas son cientos y no dicen nada. El total va
  // aparte, que alcanza para ver que la planilla se leyo entera.
  let ocultas = 0;
  const visibles = [];
  for (let i = 0; i < enc.length; i++) {
    const t = semPlano_(enc[i]);
    if (t !== 'series' && t !== 'peso') continue;
    if (meta2[i] && meta2[i].hiddenByUser) { ocultas++; continue; }
    visibles.push('   col ' + i + '  ' + t + '  fecha: ' + (semFecha_(fec[i]) || 'sin fecha'));
  }
  lineas.push('bloques ocultos    : ' + ocultas);
  lineas.push('bloques VISIBLES   : ' + visibles.length + (visibles.length > 1 ? '  <- por eso Revisar' : ''));
  visibles.forEach(function (v) { lineas.push(v); });
  lineas.push('');
  lineas.push('RESULTADO: ' + JSON.stringify(semLeerGrilla_(datos)));
  lineas.push('(no se guardo nada)');
  Logger.log(lineas.join('\n'));
}

// ============================================================
// ORQUESTACION
// ============================================================

/**
 * Los tres que corren cada hora: baja de PulsoFlow y rearma el tracking.
 *
 * Se corta fuera del horario del gimnasio en vez de tener un trigger por hora:
 * Apps Script permite 20 triggers por script, y 19 sueltos no dejarian lugar
 * para el resto. Despertarse y salir cuesta milisegundos.
 *
 * `dias` NO va aca aunque sea su vecino en la cadena: tarda minutos y no tiene
 * por que frenar al resto diecinueve veces por dia. Corre una vez, a las 3, y
 * el rebuild de las 4 levanta lo que dejo.
 */
function runHorario() {
  const h = Number(Utilities.formatDate(new Date(), CONFIG.TZ, 'H'));
  if (h < CONFIG.HORA_DESDE || h > CONFIG.HORA_HASTA) return;

  const runId = Utilities.getUuid();
  const errores = [];
  const step = function (nombre, fn) {
    try { fn(); supaLog_(runId, nombre, 'info', 'ok'); }
    catch (e) { errores.push(nombre + ': ' + e.message); supaLog_(runId, nombre, 'error', e.message); }
  };

  step('SyncCheckins', syncCheckins);
  step('SyncMembers', syncMembers);
  step('RebuildDatabase', rebuildTracking);

  if (errores.length) {
    MailApp.sendEmail(CONFIG.EMAIL,
      'ZAC pipeline - errores ' + new Date().toLocaleDateString(), errores.join('\n'));
  }
}

/** El de los dias, solo, una vez al dia. Se autolimita y sigue en la proxima. */
function runDias() {
  const runId = Utilities.getUuid();
  try {
    syncDiasEntrenamiento();
    supaLog_(runId, 'SyncTrainingDays', 'info', 'ok');
  } catch (e) {
    supaLog_(runId, 'SyncTrainingDays', 'error', e.message);
    MailApp.sendEmail(CONFIG.EMAIL, 'ZAC pipeline - fallo dias', e.message);
  }
}

// ============================================================
// TRIGGERS
// ============================================================

const TRIGGERS = [
  { fn: 'syncSheetIds',  tipo: 'diario',  hora: 2 },
  { fn: 'runDias',       tipo: 'diario',  hora: 3 },
  { fn: 'runHorario',    tipo: 'horario' },
  { fn: 'semanaRutina',  tipo: 'diario',  hora: 5,  minuto: 30 },
  { fn: 'semanaRutina',  tipo: 'diario',  hora: 8,  minuto: 30 },
  { fn: 'semanaRutina',  tipo: 'diario',  hora: 12, minuto: 30 },
  { fn: 'semanaRutina',  tipo: 'diario',  hora: 17, minuto: 30 },
  // Vive en Rutinas.gs, que es del mismo proyecto. Va aca igual porque
  // `borrarTriggers()` se lleva todos los del proyecto, no solo los de este
  // archivo: si el semanal no estuviera en esta lista, el ciclo normal de
  // borrar-y-reinstalar lo dejaria afuera y nadie se enteraria hasta el
  // domingo siguiente. Paso una vez: el 2026-09-06 no corrio.
  { fn: 'rutinasSemanales', tipo: 'semanal', dia: 'SUNDAY', hora: 3 },
];

/**
 * Deja los triggers como corresponde. Borra primero los que haya para no
 * duplicarlos: correr esto dos veces tiene que dar lo mismo que correrlo una.
 *
 * Ojo con el huso: los triggers usan el del PROYECTO, no el de la cuenta.
 * Configuracion del proyecto > Zona horaria > America/Argentina/Buenos_Aires.
 */
function instalarTodo() {
  const mios = {};
  TRIGGERS.forEach(function (t) { mios[t.fn] = true; });
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (mios[t.getHandlerFunction()]) ScriptApp.deleteTrigger(t);
  });

  TRIGGERS.forEach(function (t) {
    let b = ScriptApp.newTrigger(t.fn).timeBased();
    if (t.tipo === 'horario') {
      b = b.everyHours(1);
    } else if (t.tipo === 'semanal') {
      // El dia va como string y se resuelve aca: `ScriptApp` no esta disponible
      // cuando se evalua el `const` de arriba.
      b = b.onWeekDay(ScriptApp.WeekDay[t.dia]).atHour(t.hora);
    } else {
      b = b.everyDays(1).atHour(t.hora);
      if (t.minuto) b = b.nearMinute(t.minuto);
    }
    b.create();
  });

  Logger.log('Instalados ' + TRIGGERS.length + ' triggers:\n' + TRIGGERS.map(function (t) {
    return '  ' + (t.tipo === 'horario'
      ? 'cada hora (' + CONFIG.HORA_DESDE + 'h a ' + CONFIG.HORA_HASTA + 'h)'
      : (t.tipo === 'semanal' ? t.dia + ' ' : '')
        + String(t.hora).padStart(2, '0') + ':' + String(t.minuto || 0).padStart(2, '0') + '      ')
      + '  ' + t.fn;
  }).join('\n'));
}

/**
 * Deja el proyecto sin ningun trigger. Despues de esto no corre nada hasta que
 * se vuelva a `instalarTodo()`.
 *
 * Se lleva tambien el `after()` de reanudacion de `semanaRutina`, asi que su
 * property queda apuntando a un id muerto: se limpia acá para que la proxima
 * corrida no crea que hay una cadena en curso.
 */
function borrarTriggers() {
  const ts = ScriptApp.getProjectTriggers();
  ts.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  PropertiesService.getScriptProperties().deleteProperty(PROP_SEM_TRIGGER);
  Logger.log('Borrados ' + ts.length + ' triggers. Correr instalarTodo() para volver a arrancar.');
}

/** Que hay instalado hoy. No toca nada. */
function verTriggers() {
  const ts = ScriptApp.getProjectTriggers();
  Logger.log('Triggers instalados: ' + ts.length + ' (el limite de Apps Script es 20)\n'
    + ts.map(function (t) { return '  ' + t.getHandlerFunction(); }).join('\n'));
}

/**
 * Chequeo de que todo esta en su lugar, sin escribir nada.
 * Correr esto DESPUES de pegar el codigo y ANTES de instalarTodo.
 */
function chequeo() {
  const r = [];
  try {
    supaHeaders_();
    r.push('secret de Supabase   : OK');
  } catch (e) { r.push('secret de Supabase   : FALLA -> ' + e.message); }

  try {
    r.push('lectura de Supabase  : OK, ' + supaGet_('alumnos?select=id&limit=1').length + ' fila');
  } catch (e) { r.push('lectura de Supabase  : FALLA -> ' + e.message.slice(0, 90)); }

  try {
    getAccessToken_();
    r.push('sesion de PulsoFlow  : OK');
  } catch (e) { r.push('sesion de PulsoFlow  : FALLA -> ' + e.message.slice(0, 90)); }

  try {
    DriveApp.getFilesByType(MimeType.GOOGLE_SHEETS).hasNext();
    r.push('acceso a Drive       : OK');
  } catch (e) { r.push('acceso a Drive       : FALLA -> ' + e.message.slice(0, 90)); }

  try {
    const res = UrlFetchApp.fetch(SEM.API + '1/?fields=sheets(properties(title))',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    // Un 404 significa que la API contesta: el id "1" no existe, pero llego.
    r.push('API de Sheets        : ' + (res.getResponseCode() === 403
      ? 'FALLA -> hay que habilitarla en Servicios' : 'OK'));
  } catch (e) { r.push('API de Sheets        : FALLA -> ' + e.message.slice(0, 90)); }

  r.push('triggers instalados  : ' + ScriptApp.getProjectTriggers().length + ' de 20');
  Logger.log(r.join('\n'));
}
