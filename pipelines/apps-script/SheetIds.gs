/**
 * PASO 0 - De donde sale el sheet_id de cada alumno.
 *
 * Antes esto vivia en la planilla "Control de usuarios": una columna con el id
 * de Drive que alguien mantenia a mano. Cuatro scripts dependian de ella y un
 * alumno que faltara ahi quedaba invisible para todos, sin que nada fallara.
 *
 * Ahora la fuente es `alumnos.sheet_id` en Supabase, y esta funcion la mantiene
 * al dia sola: barre Drive buscando las rutinas y le pega el id a cada alumno.
 *
 * Corre con trigger propio y no adentro de runDaily. El barrido de Drive es
 * lento —la version vieja necesitaba varias pasadas— y metido en runDaily se
 * comia los 6 minutos que necesitan syncCheckins y los demas. Se programa una
 * hora antes con `instalarTriggerSheetIds`, asi sigue siendo lo primero del dia.
 *
 * Vive en el mismo proyecto de Apps Script que Code.gs y le usa los helpers
 * (sbGet_, sbHeaders_, log_, CONFIG). No copiarlo a otro proyecto sin eso.
 */

const SIDS = {
  SUFIJO: ' - Rutina',
  CARPETA_ARCHIVADOS: 'Usuarios archivados',
  MAX_RUNTIME_MS: 4.5 * 60 * 1000, // corta antes del tope duro de 6 min
  RETRASO_TRIGGER_MS: 2 * 60 * 1000,
  HORA_TRIGGER: 2, // una hora antes que runDaily
};

const PROP_SIDS_TOKEN = 'SHEETIDS_CONTINUATION';
const PROP_SIDS_RESUMEN = 'SHEETIDS_RESUMEN';

/** Sin acentos, sin puntuacion y en minuscula: "D'Andrea, Dolores" -> "d andrea dolores". */
function sidsNorm_(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Un PATCH por id. `sbUpsert_` no sirve para esto: mandaria la fila entera y
 * pisaria con null todo lo que no viaje en el payload.
 */
function sbPatch_(table, filtro, cambios) {
  const url = CONFIG.DEST_URL + '/rest/v1/' + table + '?' + filtro;
  const res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: Object.assign(sbHeaders_(), { Prefer: 'return=minimal' }),
    payload: JSON.stringify(cambios),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase PATCH ' + table + ': ' + res.getContentText());
  }
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
    const ap = sidsNorm_(a.apellido);
    const no = sidsNorm_(a.nombre);
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
  const nombre = archivo.getName().split(SIDS.SUFIJO)[0];
  const porNombre = indice.porNombre[sidsNorm_(nombre)];
  if (porNombre) return { alumno: porNombre, como: 'nombre' };

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

/** El iterador de Drive, arrancando donde quedo la corrida anterior. */
function sidsArchivos_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty(PROP_SIDS_TOKEN);
  if (token) return DriveApp.continueFileIterator(token);

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
function syncSheetIds() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  const props = PropertiesService.getScriptProperties();
  const runId = Utilities.getUuid();
  const t0 = Date.now();
  const r = JSON.parse(props.getProperty(PROP_SIDS_RESUMEN) || '{"puestos":0,"pisados":0,"iguales":0,"huerfanos":0}');

  try {
    const alumnos = sbGet_('alumnos?select=id,apellido,nombre,email,sheet_id');
    const indice = sidsIndexar_(alumnos);
    const archivos = sidsArchivos_();
    let corto = false;

    while (archivos.hasNext()) {
      if (Date.now() - t0 > SIDS.MAX_RUNTIME_MS) {
        props.setProperty(PROP_SIDS_TOKEN, archivos.getContinuationToken());
        props.setProperty(PROP_SIDS_RESUMEN, JSON.stringify(r));
        sidsBorrarTriggers_('syncSheetIds');
        ScriptApp.newTrigger('syncSheetIds').timeBased().after(SIDS.RETRASO_TRIGGER_MS).create();
        corto = true;
        break;
      }

      const archivo = archivos.next();
      const encontrado = sidsIdentificar_(archivo, indice);

      if (!encontrado.alumno) {
        r.huerfanos++;
        log_(runId, 'sheetIds', 'warn', 'Rutina sin alumno: ' + encontrado.como,
          { archivo: archivo.getName(), sheet_id: archivo.getId() });
        continue;
      }

      const a = encontrado.alumno;
      const id = archivo.getId();
      if (a.sheet_id === id) { r.iguales++; continue; }

      // El indice unico parcial de `alumnos.sheet_id` no deja que dos fichas
      // compartan la misma rutina: si choca, avisa en vez de romper la corrida.
      try {
        sbPatch_('alumnos', 'id=eq.' + a.id, { sheet_id: id });
      } catch (e) {
        r.huerfanos++;
        log_(runId, 'sheetIds', 'error', 'No se pudo guardar el sheet_id: ' + e.message,
          { alumno: a.apellido + ', ' + a.nombre, sheet_id: id });
        continue;
      }

      if (a.sheet_id) {
        r.pisados++;
        log_(runId, 'sheetIds', 'warn', 'Tenia otra rutina y se piso con la de Drive',
          { alumno: a.apellido + ', ' + a.nombre, antes: a.sheet_id, ahora: id });
      } else {
        r.puestos++;
      }
      a.sheet_id = id; // el indice en memoria queda al dia para el resto de la corrida
    }

    if (!corto) {
      props.deleteProperty(PROP_SIDS_TOKEN);
      props.deleteProperty(PROP_SIDS_RESUMEN);
      sidsBorrarTriggers_('syncSheetIds');
      log_(runId, 'sheetIds', 'info', 'Listo', r);
      Logger.log('sheetIds: ' + JSON.stringify(r));
    } else {
      Logger.log('sheetIds: corte por tiempo, sigue en un rato. ' + JSON.stringify(r));
    }
  } catch (e) {
    log_(runId, 'sheetIds', 'error', e.message, null);
    Logger.log('ERROR en syncSheetIds: ' + e.message + ' ' + e.stack);
  } finally {
    lock.releaseLock();
  }
}

/** Deja solo el trigger diario, sin los de reanudacion que quedaron colgados. */
function sidsBorrarTriggers_(nombre) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === nombre && t.getEventType() === ScriptApp.EventType.CLOCK) {
      // Los diarios se distinguen porque no se recrean solos; se borran todos y
      // `instalarTriggerSheetIds` vuelve a poner el que corresponde.
      ScriptApp.deleteTrigger(t);
    }
  });
}

/** Correr UNA vez. Deja el barrido diario una hora antes que runDaily. */
function instalarTriggerSheetIds() {
  sidsBorrarTriggers_('syncSheetIds');
  ScriptApp.newTrigger('syncSheetIds')
    .timeBased()
    .everyDays(1)
    .atHour(SIDS.HORA_TRIGGER)
    .create();
  Logger.log('Trigger diario de syncSheetIds instalado a las ' + SIDS.HORA_TRIGGER + ':00.');
}

/** Sin tocar nada: dice que haria y con cuantos alumnos no engancha. */
function previewSheetIds() {
  const alumnos = sbGet_('alumnos?select=id,apellido,nombre,email,sheet_id');
  const indice = sidsIndexar_(alumnos);
  const archivos = sidsArchivos_();
  const r = { puestos: 0, pisados: 0, iguales: 0, huerfanos: 0 };
  const t0 = Date.now();

  while (archivos.hasNext() && Date.now() - t0 < SIDS.MAX_RUNTIME_MS) {
    const archivo = archivos.next();
    const encontrado = sidsIdentificar_(archivo, indice);
    if (!encontrado.alumno) {
      r.huerfanos++;
      Logger.log('SIN ALUMNO (' + encontrado.como + '): ' + archivo.getName());
      continue;
    }
    const a = encontrado.alumno;
    if (a.sheet_id === archivo.getId()) r.iguales++;
    else if (a.sheet_id) {
      r.pisados++;
      Logger.log('PISARIA: ' + a.apellido + ', ' + a.nombre + '  ' + a.sheet_id + ' -> ' + archivo.getId());
    } else {
      r.puestos++;
      Logger.log('PONDRIA: ' + a.apellido + ', ' + a.nombre + ' -> ' + archivo.getId());
    }
  }
  Logger.log('PREVIEW: ' + JSON.stringify(r));
  return r;
}

// ============================================================
// MEDICION - no toca la base
// ============================================================

const PROP_MEDIR = 'SHEETIDS_MEDICION';
const PROP_MEDIR_TOKEN = 'SHEETIDS_MEDICION_TOKEN';

/** 0 = barrer todo. Un numero corta antes y sirve para una estimacion rapida. */
const MEDIR_TOPE = 0;

/**
 * Cuanto tarda el barrido y con cuantos archivos engancha. No escribe nada.
 *
 * Acumula entre pasadas: 1900 archivos no entran en los 6 minutos de Apps
 * Script, asi que se reprograma sola y suma el tiempo de cada tramo. El total
 * que informa al final es el de la suma, no el de la ultima pasada.
 *
 * Sirve de ensayo antes de habilitar `syncSheetIds`: dice cuantos archivos
 * cambiarian de dueño y cuantos quedarian huerfanos, sin tocar un solo dato.
 */
function medirSheetIds() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  const props = PropertiesService.getScriptProperties();
  const t0 = Date.now();
  const m = JSON.parse(props.getProperty(PROP_MEDIR) || JSON.stringify({
    archivos: 0, msBarrido: 0, msAlumnos: 0, pasadas: 0,
    porNombre: 0, porMail: 0, huerfanos: 0,
    yaEstaba: 0, pondria: 0, pisaria: 0, ejemplos: [],
  }));
  m.pasadas++;

  try {
    const tAlumnos = Date.now();
    const alumnos = sbGet_('alumnos?select=id,apellido,nombre,email,sheet_id');
    const indice = sidsIndexar_(alumnos);
    m.msAlumnos += Date.now() - tAlumnos;

    // El estado que iria quedando, en memoria: sin esto un segundo archivo del
    // mismo alumno se contaria de nuevo como "pondria".
    const asignado = {};
    alumnos.forEach(function (a) { if (a.sheet_id) asignado[a.id] = a.sheet_id; });

    const token = props.getProperty(PROP_MEDIR_TOKEN);
    const archivos = token ? DriveApp.continueFileIterator(token) : sidsArchivosTodos_();
    let corto = false;

    while (archivos.hasNext()) {
      if (Date.now() - t0 > SIDS.MAX_RUNTIME_MS ||
          (MEDIR_TOPE > 0 && m.archivos >= MEDIR_TOPE)) {
        corto = MEDIR_TOPE === 0 || m.archivos < MEDIR_TOPE;
        break;
      }

      const archivo = archivos.next();
      m.archivos++;
      const encontrado = sidsIdentificar_(archivo, indice);

      if (!encontrado.alumno) {
        m.huerfanos++;
        if (m.ejemplos.length < 25) {
          m.ejemplos.push('SIN ALUMNO (' + encontrado.como + '): ' + archivo.getName());
        }
        continue;
      }

      if (encontrado.como === 'nombre') m.porNombre++; else m.porMail++;

      const a = encontrado.alumno;
      const id = archivo.getId();
      const actual = asignado[a.id] || null;
      if (actual === id) {
        m.yaEstaba++;
      } else if (actual) {
        m.pisaria++;
        if (m.ejemplos.length < 25) {
          m.ejemplos.push('PISARIA ' + a.apellido + ', ' + a.nombre + ': ' + actual + ' -> ' + id);
        }
        asignado[a.id] = id;
      } else {
        m.pondria++;
        asignado[a.id] = id;
      }
    }

    m.msBarrido += Date.now() - t0;

    if (corto && archivos.hasNext()) {
      props.setProperty(PROP_MEDIR_TOKEN, archivos.getContinuationToken());
      props.setProperty(PROP_MEDIR, JSON.stringify(m));
      sidsBorrarTriggers_('medirSheetIds');
      ScriptApp.newTrigger('medirSheetIds').timeBased().after(SIDS.RETRASO_TRIGGER_MS).create();
      Logger.log('MEDICION pasada ' + m.pasadas + ': ' + m.archivos + ' archivos en ' +
        Math.round(m.msBarrido / 1000) + 's acumulados. Sigue en ' +
        (SIDS.RETRASO_TRIGGER_MS / 1000) + 's.');
      return;
    }

    props.deleteProperty(PROP_MEDIR_TOKEN);
    props.deleteProperty(PROP_MEDIR);
    sidsBorrarTriggers_('medirSheetIds');

    const seg = m.msBarrido / 1000;
    Logger.log([
      '================ MEDICION TERMINADA ================',
      'archivos "- Rutina" en Drive : ' + m.archivos,
      'pasadas necesarias           : ' + m.pasadas,
      'tiempo total del barrido     : ' + seg.toFixed(1) + 's  (' + (seg / 60).toFixed(1) + ' min)',
      'de eso, leer alumnos         : ' + (m.msAlumnos / 1000).toFixed(1) + 's',
      'ritmo                        : ' + (m.archivos / seg).toFixed(1) + ' archivos/seg',
      '',
      'enganchan por nombre         : ' + m.porNombre,
      'enganchan por mail           : ' + m.porMail,
      'sin alumno                   : ' + m.huerfanos,
      '',
      'ya tenian el id correcto     : ' + m.yaEstaba,
      'se les pondria el id         : ' + m.pondria,
      'se les PISARIA otro id       : ' + m.pisaria,
      '',
      'NO se escribio nada en la base.',
      '',
      'Ejemplos:',
    ].concat(m.ejemplos).join('\n'));
  } catch (e) {
    Logger.log('ERROR en medirSheetIds: ' + e.message + ' ' + e.stack);
  } finally {
    lock.releaseLock();
  }
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

/** Borra el estado acumulado para volver a medir desde cero. */
function reiniciarMedicion() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_MEDIR);
  props.deleteProperty(PROP_MEDIR_TOKEN);
  sidsBorrarTriggers_('medirSheetIds');
  Logger.log('Medicion reiniciada.');
}
