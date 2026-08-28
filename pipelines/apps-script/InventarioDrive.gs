/**
 * Inventario de Drive, para limpiar a mano.
 *
 * Vuelca todos los archivos a una planilla nueva con las señales que sirven
 * para decidir cual queda y cual se archiva: que alumno se le detecta, si ese
 * alumno esta en la base, cuantos archivos comparten el mismo alumno, y que
 * palabras sospechosas trae el nombre.
 *
 * No es un pipeline: no toca nada, ni Drive ni Supabase. Se corre a mano cuando
 * hay que ordenar.
 *
 * Sale a una planilla y no al Log porque son miles de filas. Escribe de a
 * tandas mientras recorre, asi un corte por tiempo no pierde lo ya hecho, y se
 * reanuda sola. `inventarioReiniciar` la vuelve a empezar de cero.
 *
 * Es autonomo: no depende de Code.gs ni de SheetIds.gs.
 */

const INV = {
  // En false lista TODO Drive: fotos, PDFs, lo que haya. En true solo planillas,
  // que es donde viven las rutinas y suele ser lo unico que interesa ordenar.
  SOLO_PLANILLAS: true,
  NOMBRE_PLANILLA: 'Inventario de Drive',
  TANDA: 200,
  MAX_RUNTIME_MS: 4.5 * 60 * 1000,
  RETRASO_TRIGGER_MS: 60 * 1000,
  SUPA_URL: 'https://lrjqasglgmcxntuwamow.supabase.co',
};

const PROP_INV_TOKEN = 'INVENTARIO_TOKEN';
const PROP_INV_HOJA = 'INVENTARIO_HOJA';

const INV_COLUMNAS = [
  'Nombre del archivo', 'Alumno detectado', 'En la base', 'Señales',
  'Modificado', 'Carpeta', 'Tipo', 'ID', 'URL',
];

/** Sin acentos ni puntuacion, en minuscula. */
function invNorm_(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * El nombre del alumno adentro del nombre del archivo. Misma regla que usa
 * SheetIds.gs, repetida a proposito para que este archivo ande solo.
 */
function invSoloNombre_(titulo, sacarParentesis) {
  let t = String(titulo);
  if (sacarParentesis) t = t.replace(/\([^)]*\)/g, ' ');
  return t
    .replace(/[-–—]?\s*rutina.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * El alumno que le corresponde, probando con parentesis y despues sin.
 * Hay tres alumnos cuyo nombre ES el parentesis —"(Hijo)", "(Padre)",
 * "(grande)"— y cada uno tiene un homonimo sin el: sacarlos de entrada
 * funde a padre e hijo en una sola persona.
 */
function invAlumnoDe_(titulo, enBase) {
  const conParens = invSoloNombre_(titulo, false);
  if (enBase && enBase[invNorm_(conParens)]) return conParens;
  const sinParens = invSoloNombre_(titulo, true);
  if (enBase && enBase[invNorm_(sinParens)]) return sinParens;
  return conParens;
}

/**
 * Lo que hace ruido en el nombre. No decide nada: junta indicios para que el
 * que ordena mire primero donde conviene.
 */
function invSenales_(titulo) {
  const t = invNorm_(titulo);
  const s = [];
  if (/\b(vieja|viejo|old|anterior|antigua)\b/.test(t)) s.push('dice vieja');
  if (/\b(copia|copy|copias)\b/.test(t)) s.push('es copia');
  if (/\b(nueva|nuevo|new)\b/.test(t)) s.push('dice nueva');
  if (/\b(prueba|test|borrador|temporal|tmp)\b/.test(t)) s.push('parece prueba');
  // Las mismas palabras que SheetIds saltea: si aparecen, el archivo queda fuera
  // del barrido aunque diga "Rutina".
  if (/(archivad|no usar|descartar|obsolet)/.test(t)) s.push('IGNORADA por el barrido');
  if (/\b(19|20)\d{2}\b/.test(t)) s.push('tiene un año');
  if (!/rutina/.test(t)) s.push('no dice rutina');
  else if (!/[-–—]\s*rutina/i.test(titulo)) s.push('sin guion antes de rutina');
  if (/^copia de /.test(t)) s.push('empieza con "Copia de"');
  if (titulo.indexOf(',') === -1 && /rutina/.test(t)) s.push('sin coma');
  return s.join(' · ');
}

/** Los alumnos de la base, indexados como los busca SheetIds. Vacio si no hay secret. */
function invAlumnos_() {
  const props = PropertiesService.getScriptProperties();
  const cruda = props.getProperty('SHEETIDS_SUPABASE_SECRET')
    || props.getProperty('DEST_SUPABASE_SECRET') || '';
  const secret = cruda.replace(/\s+/g, '');
  if (!secret || secret.indexOf('eyJ') !== 0) return null;

  try {
    const res = UrlFetchApp.fetch(
      INV.SUPA_URL + '/rest/v1/alumnos?select=apellido,nombre',
      { headers: { apikey: secret, authorization: 'Bearer ' + secret }, muteHttpExceptions: true });
    if (res.getResponseCode() >= 300) return null;
    const indice = {};
    JSON.parse(res.getContentText()).forEach(function (a) {
      const ap = invNorm_(a.apellido), no = invNorm_(a.nombre);
      indice[ap + ' ' + no] = true;
      indice[no + ' ' + ap] = true;
    });
    return indice;
  } catch (e) {
    return null;
  }
}

/** La planilla donde se vuelca, creandola en la primera pasada. */
function invHoja_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP_INV_HOJA);
  if (id) return SpreadsheetApp.openById(id).getSheets()[0];

  const ss = SpreadsheetApp.create(INV.NOMBRE_PLANILLA + ' ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  const hoja = ss.getSheets()[0];
  hoja.appendRow(INV_COLUMNAS);
  hoja.setFrozenRows(1);
  hoja.getRange(1, 1, 1, INV_COLUMNAS.length).setFontWeight('bold');
  props.setProperty(PROP_INV_HOJA, ss.getId());
  Logger.log('Planilla creada: ' + ss.getUrl());
  return hoja;
}

/**
 * Recorre Drive y arma el inventario.
 *
 * Correr varias veces si corta por tiempo, o dejar que el trigger la reanude
 * sola. Al terminar avisa la URL de la planilla.
 */
function inventarioDrive() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  const props = PropertiesService.getScriptProperties();
  const t0 = Date.now();

  try {
    const hoja = invHoja_();
    const enBase = invAlumnos_();
    const token = props.getProperty(PROP_INV_TOKEN);
    const archivos = token
      ? DriveApp.continueFileIterator(token)
      : (INV.SOLO_PLANILLAS
          ? DriveApp.getFilesByType(MimeType.GOOGLE_SHEETS)
          : DriveApp.getFiles());

    let tanda = [];
    let cuantos = 0;
    let corto = false;

    while (archivos.hasNext()) {
      if (Date.now() - t0 > INV.MAX_RUNTIME_MS) { corto = true; break; }

      const f = archivos.next();
      const titulo = f.getName();
      const alumno = invAlumnoDe_(titulo, enBase);
      let carpeta = '';
      try {
        const padres = f.getParents();
        carpeta = padres.hasNext() ? padres.next().getName() : '(raiz)';
      } catch (e) { carpeta = '(sin acceso)'; }

      tanda.push([
        titulo,
        alumno,
        enBase === null ? 'sin base' : (enBase[invNorm_(alumno)] ? 'si' : 'NO'),
        invSenales_(titulo),
        f.getLastUpdated(),
        carpeta,
        f.getMimeType().indexOf('spreadsheet') !== -1 ? 'planilla' : f.getMimeType(),
        f.getId(),
        f.getUrl(),
      ]);
      cuantos++;

      if (tanda.length >= INV.TANDA) {
        hoja.getRange(hoja.getLastRow() + 1, 1, tanda.length, INV_COLUMNAS.length).setValues(tanda);
        tanda = [];
      }
    }

    if (tanda.length) {
      hoja.getRange(hoja.getLastRow() + 1, 1, tanda.length, INV_COLUMNAS.length).setValues(tanda);
    }

    if (corto && archivos.hasNext()) {
      props.setProperty(PROP_INV_TOKEN, archivos.getContinuationToken());
      invBorrarTriggers_();
      ScriptApp.newTrigger('inventarioDrive').timeBased().after(INV.RETRASO_TRIGGER_MS).create();
      Logger.log('Inventario: ' + (hoja.getLastRow() - 1) + ' archivos hasta ahora. Sigue en un minuto.');
      return;
    }

    props.deleteProperty(PROP_INV_TOKEN);
    invBorrarTriggers_();
    invMarcarRepetidos_(hoja);
    Logger.log('================ INVENTARIO TERMINADO ================\n' +
      'archivos listados : ' + (hoja.getLastRow() - 1) + '\n' +
      'planilla          : ' + hoja.getParent().getUrl() + '\n' +
      (enBase === null ? 'NO se pudo cruzar con la base (falta la secret).' : 'Cruzado con la base.'));
  } catch (e) {
    Logger.log('ERROR en inventarioDrive: ' + e.message + ' ' + e.stack);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deja juntos los archivos que apuntan al mismo alumno y les cuenta cuantos son.
 *
 * Es lo que hace saltar a la vista los duplicados: un alumno con dos rutinas
 * queda con sus dos filas pegadas y un numero en la ultima columna.
 */
function invMarcarRepetidos_(hoja) {
  const ultima = hoja.getLastRow();
  if (ultima < 2) return;

  const datos = hoja.getRange(2, 1, ultima - 1, INV_COLUMNAS.length).getValues();
  const cuenta = {};
  datos.forEach(function (f) {
    const k = invNorm_(f[1]);
    if (k) cuenta[k] = (cuenta[k] || 0) + 1;
  });

  // Primero los que se repiten, y adentro por alumno: asi las filas hermanas
  // quedan pegadas y se comparan de un vistazo.
  datos.sort(function (a, b) {
    const ca = cuenta[invNorm_(a[1])] || 0, cb = cuenta[invNorm_(b[1])] || 0;
    if (ca !== cb) return cb - ca;
    return String(a[1]).localeCompare(String(b[1]), 'es');
  });

  const conCuenta = datos.map(function (f) {
    return f.concat([cuenta[invNorm_(f[1])] || 0]);
  });

  hoja.getRange(1, INV_COLUMNAS.length + 1).setValue('Archivos del mismo alumno').setFontWeight('bold');
  hoja.getRange(2, 1, conCuenta.length, INV_COLUMNAS.length + 1).setValues(conCuenta);
  hoja.autoResizeColumns(1, 4);
}

function invBorrarTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'inventarioDrive') ScriptApp.deleteTrigger(t);
  });
}

/** Borra el estado y la referencia a la planilla, para empezar un inventario nuevo. */
function inventarioReiniciar() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_INV_TOKEN);
  props.deleteProperty(PROP_INV_HOJA);
  invBorrarTriggers_();
  Logger.log('Listo. La proxima corrida crea una planilla nueva. La anterior no se borro.');
}
