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
 * Es autonomo: trae sus propios helpers de Supabase, con nombres prefijados
 * para no chocar con los de Code.gs. Se puede pegar en el proyecto del pipeline
 * o en uno nuevo; en cualquiera de los dos anda solo. Lo unico que necesita es
 * la secret, una vez, con `setSecretsSheetIds`.
 */

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

const PROP_SIDS_SECRET = 'SHEETIDS_SUPABASE_SECRET';
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
 * Correr UNA vez si este archivo esta en un proyecto propio. Si esta en el
 * mismo que Code.gs no hace falta: reusa la secret que ese ya tiene guardada.
 * Tiene que ser la key legacy service_role (un JWT largo "eyJ..."): la
 * sb_secret_... la bloquea Supabase desde Apps Script.
 */
function setSecretsSheetIds() {
  PropertiesService.getScriptProperties().setProperty(PROP_SIDS_SECRET, 'PEGAR_SERVICE_ROLE_JWT_ACA');
  Logger.log('Secret guardada. Borra el valor del codigo por seguridad.');
}

function sidsHeaders_() {
  const props = PropertiesService.getScriptProperties();
  // La propia primero; si no esta, la de Code.gs, para no pedir la misma secret
  // dos veces cuando los dos archivos comparten proyecto.
  const guardada = props.getProperty(PROP_SIDS_SECRET) || props.getProperty('DEST_SUPABASE_SECRET');
  // Copiar del panel se trae saltos de linea y espacios sin que se vean, y
  // Supabase contesta "Invalid API key" sin decir por que.
  const secret = (guardada || '').replace(/\s+/g, '');
  if (!secret || secret.indexOf('PEGAR_') === 0) {
    throw new Error('Falta la secret. Corre setSecretsSheetIds una vez.');
  }
  if (secret.indexOf('eyJ') !== 0) {
    throw new Error('La secret no es un JWT legacy: arranca con "' + secret.slice(0, 3) +
      '" y tiene que arrancar con "eyJ". Corre diagnosticarSecret.');
  }
  return { apikey: secret, authorization: 'Bearer ' + secret };
}

function sidsGet_(pathQuery) {
  const res = UrlFetchApp.fetch(SIDS.SUPA_URL + '/rest/v1/' + pathQuery, {
    headers: sidsHeaders_(),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase GET ' + pathQuery + ': ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

/**
 * Un PATCH por id. Un upsert no sirve: mandaria la fila entera y pisaria con
 * null todo lo que no viaje en el payload.
 */
function sidsPatch_(table, filtro, cambios) {
  const url = SIDS.SUPA_URL + '/rest/v1/' + table + '?' + filtro;
  const res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: Object.assign(sidsHeaders_(), { Prefer: 'return=minimal' }),
    payload: JSON.stringify(cambios),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase PATCH ' + table + ': ' + res.getContentText());
  }
}

/** Deja la corrida en pipeline_logs, igual que el resto del pipeline. */
function sidsLog_(runId, nivel, mensaje, contexto) {
  try {
    UrlFetchApp.fetch(SIDS.SUPA_URL + '/rest/v1/pipeline_logs', {
      method: 'post',
      contentType: 'application/json',
      headers: Object.assign(sidsHeaders_(), { Prefer: 'return=minimal' }),
      payload: JSON.stringify([{
        run_id: runId, pipeline: 'sheetIds', nivel: nivel,
        mensaje: mensaje, contexto: contexto || null,
      }]),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('No se pudo loguear: ' + e);
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
 * A quien pertenece el archivo.
 *
 * Primero el nombre, que es la señal del archivo mismo. Si no engancha, con que
 * mails esta compartido: cuesta una llamada mas a Drive, asi que solo se paga
 * cuando el nombre fallo.
 */
function sidsIdentificar_(archivo, indice) {
  const titulo = archivo.getName();

  const plano = sidsNorm_(titulo);
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
    const a = indice.porNombre[sidsNorm_(sidsSoloNombre_(titulo, i === 1))];
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
    const alumnos = sidsGet_('alumnos?select=id,apellido,nombre,email,sheet_id');
    const relevo = sidsRelevar_(sidsIndexar_(alumnos));

    if (relevo.incompleto) {
      sidsLog_(runId, 'error', 'El barrido de Drive no termino, no se escribio nada',
        { archivos_vistos: relevo.vistos });
      Logger.log('sheetIds: barrido incompleto (' + relevo.vistos + ' archivos). No se escribio nada.');
      return;
    }

    const r = { puestos: 0, pisados: 0, iguales: 0, duplicados: 0, huerfanos: relevo.huerfanos.length };

    relevo.huerfanos.forEach(function (h) {
      sidsLog_(runId, 'warn', 'Rutina sin alumno: ' + h.motivo, { archivo: h.archivo, sheet_id: h.id });
    });

    Object.keys(relevo.porAlumno).forEach(function (alumnoId) {
      const entrada = relevo.porAlumno[alumnoId];
      const a = entrada.alumno;

      if (entrada.ids.length > 1) {
        r.duplicados++;
        sidsLog_(runId, 'warn', 'Tiene ' + entrada.ids.length + ' rutinas en Drive, no se toca ninguna',
          { alumno: a.apellido + ', ' + a.nombre, rutinas: entrada.ids });
        return;
      }

      const id = entrada.ids[0];
      if (a.sheet_id === id) { r.iguales++; return; }

      // El indice unico parcial de `alumnos.sheet_id` no deja que dos fichas
      // compartan la misma rutina: si choca, avisa en vez de romper la corrida.
      try {
        sidsPatch_('alumnos', 'id=eq.' + a.id, { sheet_id: id });
      } catch (e) {
        sidsLog_(runId, 'error', 'No se pudo guardar el sheet_id: ' + e.message,
          { alumno: a.apellido + ', ' + a.nombre, sheet_id: id });
        return;
      }

      if (a.sheet_id) {
        r.pisados++;
        sidsLog_(runId, 'warn', 'Tenia otra rutina y se piso con la de Drive',
          { alumno: a.apellido + ', ' + a.nombre, antes: a.sheet_id, ahora: id });
      } else {
        r.puestos++;
      }
    });

    sidsLog_(runId, 'info', 'Listo', r);
    Logger.log('sheetIds: ' + JSON.stringify(r));
  } catch (e) {
    sidsLog_(runId, 'error', e.message, null);
    Logger.log('ERROR en syncSheetIds: ' + e.message + ' ' + e.stack);
  } finally {
    lock.releaseLock();
  }
}

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
  const alumnos = sidsGet_('alumnos?select=id,apellido,nombre,email,sheet_id');
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
  // Ya no hay estado que limpiar: la medicion es de una sola pasada. Queda la
  // funcion porque los triggers de reanudacion viejos pueden seguir colgados.
  sidsBorrarTriggers_('medirSheetIds');
  Logger.log('Triggers de medicion viejos borrados. La medicion ya no guarda estado.');
}

/**
 * Que hay guardado y si sirve. No imprime la key, solo con que arranca y
 * cuanto mide: alcanza para ver si se copio cortada o con espacios de mas.
 */
function diagnosticarSecret() {
  const props = PropertiesService.getScriptProperties();
  const propia = props.getProperty(PROP_SIDS_SECRET);
  const deCode = props.getProperty('DEST_SUPABASE_SECRET');
  const cual = propia ? PROP_SIDS_SECRET : (deCode ? 'DEST_SUPABASE_SECRET' : null);
  const cruda = propia || deCode || '';
  const limpia = cruda.replace(/\s+/g, '');

  const lineas = [
    'propiedad usada     : ' + (cual || 'NINGUNA, no hay secret guardada'),
    'arranca con         : ' + (limpia.slice(0, 3) || '(vacia)'),
    'largo               : ' + limpia.length + (cruda.length !== limpia.length
      ? '  (tenia ' + (cruda.length - limpia.length) + ' espacios o saltos de linea)' : ''),
    'esperado            : arranca con "eyJ" y mide ~219',
  ];

  if (limpia && limpia.indexOf('eyJ') === 0) {
    // Un JWT trae el rol adentro: sirve para ver si pegaron la anon por error.
    try {
      const cuerpo = JSON.parse(Utilities.newBlob(
        Utilities.base64DecodeWebSafe(limpia.split('.')[1])).getDataAsString());
      lineas.push('rol que declara     : ' + cuerpo.role);
    } catch (e) {
      lineas.push('rol que declara     : no se pudo leer, el JWT parece cortado');
    }
  }

  try {
    const n = sidsGet_('alumnos?select=id&limit=1').length;
    lineas.push('prueba contra la base: OK, contesto con ' + n + ' fila');
  } catch (e) {
    lineas.push('prueba contra la base: FALLA -> ' + e.message.slice(0, 120));
  }

  Logger.log(lineas.join('\n'));
}
