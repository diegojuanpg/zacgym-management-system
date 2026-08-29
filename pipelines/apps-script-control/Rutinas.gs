/**
 * ZAC GYM — Avanzar y repetir la semana de rutina.
 *
 * Dos acciones sobre la planilla de un alumno:
 *
 *   AVANZAR  muestra el bloque siguiente, fechado al lunes que viene.
 *   REPETIR  vuelve a mostrar el bloque de esta semana, refechado al lunes
 *            que viene, para que la haga de nuevo.
 *
 * Este archivo trae adentro el motor que mueve el bloque. Antes vivia en el
 * Code.gs de "Control de usuarios" y `RutinasPorAsistencia.gs` lo llamaba sin
 * definirlo: si los dos no estaban en el mismo proyecto, fallaba con
 * "procesarYExtraerEntrenamiento_ is not defined". Aca no depende de nadie.
 *
 * ESTA VERSION ES PARA PROBAR, DE A UN ALUMNO. Pone el apellido en APELLIDO y
 * corre `avanzarUno` o `repetirUno`. Antes conviene `verUno`, que no escribe.
 *
 * OJO: avanzar y repetir ESCRIBEN en la planilla del alumno. No hay deshacer.
 */

const RUT = {
  SUPA_URL: 'https://lrjqasglgmcxntuwamow.supabase.co',
  TZ: 'America/Argentina/Buenos_Aires',
};

const PROP_RUT_SECRET = 'RUTINAS_SUPABASE_SECRET';

/** El alumno a probar. Alcanza con parte del apellido. */
const APELLIDO = 'CAMBIAR_APELLIDO_ACA';

/** Correr una vez si este archivo esta en un proyecto propio. */
function setSecretsRutinas() {
  PropertiesService.getScriptProperties().setProperty(PROP_RUT_SECRET, 'PEGAR_SERVICE_ROLE_JWT_ACA');
  Logger.log('Secret guardada. Borra el valor del codigo por seguridad.');
}

// ============================================================
// ENTRADAS — lo que se ejecuta a mano
// ============================================================

/** Que haria, sin tocar nada. Correr esto primero. */
function verUno() {
  const a = rutBuscarAlumno_(APELLIDO);
  if (!a) return;
  const f = rutFechas_();
  const ss = SpreadsheetApp.openById(a.sheet_id);
  const hoja = encontrarHojaEntrenamiento_(ss);

  const lineas = [
    'alumno          : ' + a.apellido + ', ' + a.nombre,
    'planilla        : https://docs.google.com/spreadsheets/d/' + a.sheet_id,
    'hoja            : ' + (hoja ? hoja.getName() : 'NO SE ENCONTRO'),
    'semana en la base: ' + (a.rutina_semana || '(sin leer)'),
    '',
    'AVANZAR buscaria el bloque fechado ' + _ymd_(f.lunesProx) + ' (lunes que viene)',
    'REPETIR tomaria el de ' + _ymd_(f.lunesEsta) + ' y lo refecharia a ' + _ymd_(f.lunesProx),
    '',
    '(no se escribio nada)',
  ];
  Logger.log(lineas.join('\n'));
}

/** Avanza al bloque siguiente. ESCRIBE en la planilla. */
function avanzarUno() {
  rutCorrerUno_('avanzar');
}

/** Repite la semana actual, refechada a la que viene. ESCRIBE en la planilla. */
function repetirUno() {
  rutCorrerUno_('repetir');
}

function rutCorrerUno_(accion) {
  const a = rutBuscarAlumno_(APELLIDO);
  if (!a) return;
  const f = rutFechas_();
  const runId = Utilities.getUuid();
  const quien = a.apellido + ', ' + a.nombre;

  try {
    let r;
    if (accion === 'avanzar') {
      // Los RMs se cargan antes de mover el bloque: despues, la semana de test
      // ya no esta visible y no hay de donde leerlos.
      realizarTareasPreActualizacion_(a.sheet_id);
      r = procesarYExtraerEntrenamiento_(a.sheet_id, f.lunesProx, false, f.lunesProx);
    } else {
      // Repetir toma el bloque de ESTA semana y le reescribe la fecha a la que
      // viene: el alumno ve el mismo trabajo, fechado adelante.
      r = procesarYExtraerEntrenamiento_(a.sheet_id, f.lunesEsta, true, f.lunesProx);
    }

    if (r.rutinaStatus !== 'Actualizada') {
      Logger.log(accion.toUpperCase() + ' FALLO en ' + quien + ': ' + r.entrenamientoInfo.error);
      rutLog_(runId, 'error', accion + ' fallo: ' + r.entrenamientoInfo.error, { alumno: quien });
      return;
    }

    const info = r.entrenamientoInfo;
    Logger.log([
      accion.toUpperCase() + ' OK — ' + quien,
      '  bloque : ' + info.bloque,
      '  fecha  : ' + (info.fecha instanceof Date ? _ymd_(info.fecha) : info.fecha),
      '  semana : ' + info.semana,
      '',
      'Abri la planilla y confirma que quedo visible el bloque correcto:',
      'https://docs.google.com/spreadsheets/d/' + a.sheet_id,
    ].join('\n'));
    rutLog_(runId, 'info', accion + ' ok', { alumno: quien, bloque: info.bloque });
  } catch (e) {
    Logger.log('ERROR en ' + quien + ': ' + e.message + '\n' + e.stack);
    rutLog_(runId, 'error', e.message, { alumno: quien });
  }
}

/** El alumno, buscado por apellido. Avisa si hay mas de uno. */
function rutBuscarAlumno_(apellido) {
  if (!apellido || apellido.indexOf('CAMBIAR_') === 0) {
    Logger.log('Pone un apellido en la constante APELLIDO, arriba del archivo.');
    return null;
  }
  const rows = rutGet_('alumnos_cuenta?select=id,apellido,nombre,sheet_id,rutina_semana'
    + '&sheet_id=not.is.null&apellido=ilike.' + encodeURIComponent('%' + apellido + '%'));
  if (!rows.length) {
    Logger.log('No hay ningun alumno con planilla cuyo apellido contenga "' + apellido + '".');
    return null;
  }
  if (rows.length > 1) {
    // Elegir uno al azar entre homonimos escribiria en la planilla equivocada.
    Logger.log('Hay ' + rows.length + ' alumnos con ese apellido. Se mas especifico:\n'
      + rows.map(function (r) { return '   ' + r.apellido + ', ' + r.nombre; }).join('\n'));
    return null;
  }
  return rows[0];
}

// ============================================================
// FECHAS
// ============================================================

function _ymd_(d) {
  return Utilities.formatDate(new Date(d), RUT.TZ, 'yyyy-MM-dd');
}

/**
 * El lunes de esta semana y el de la que viene, en hora Argentina.
 *
 * La fecha que va a la planilla se ancla al MEDIODIA: a las 00:00, cualquier
 * huso al oeste la renderiza el dia anterior y la rutina queda fechada un dia
 * antes (el 24/08 se escribia 23/08).
 */
function rutFechas_() {
  const hoy = new Date(_ymd_(new Date()) + 'T00:00:00-03:00');
  const dow = hoy.getUTCDay();                  // 0=domingo
  const aLunes = (dow === 0 ? -6 : 1 - dow);    // el domingo cierra la semana, no la abre
  const lunesEsta0 = new Date(hoy.getTime() + aLunes * 86400000);
  return {
    lunesEsta: new Date(lunesEsta0.getTime() + 12 * 3600000),
    lunesProx: new Date(lunesEsta0.getTime() + 7 * 86400000 + 12 * 3600000),
  };
}

// ============================================================
// SUPABASE
// ============================================================

function rutHeaders_() {
  const props = PropertiesService.getScriptProperties();
  const cruda = props.getProperty(PROP_RUT_SECRET)
    || props.getProperty('DEST_SUPABASE_SECRET') || '';
  const secret = cruda.replace(/\s+/g, '');
  if (!secret || secret.indexOf('eyJ') !== 0) {
    throw new Error('Falta la secret legacy service_role. Corre setSecretsRutinas.');
  }
  return { apikey: secret, authorization: 'Bearer ' + secret };
}

function rutGet_(pathQuery) {
  const res = UrlFetchApp.fetch(RUT.SUPA_URL + '/rest/v1/' + pathQuery,
    { headers: rutHeaders_(), muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase GET: ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

function rutLog_(runId, nivel, mensaje, contexto) {
  try {
    UrlFetchApp.fetch(RUT.SUPA_URL + '/rest/v1/pipeline_logs', {
      method: 'post',
      contentType: 'application/json',
      headers: Object.assign(rutHeaders_(), { Prefer: 'return=minimal' }),
      payload: JSON.stringify([{
        run_id: runId, pipeline: 'rutinas', nivel: nivel,
        mensaje: mensaje, contexto: contexto || null,
      }]),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('No se pudo loguear: ' + e);
  }
}

// ============================================================
// MOTOR — mueve el bloque en la planilla del alumno
//
// Todo lo que sigue viene del Code.gs de "Control de usuarios", sin cambios de
// logica. Se copia aca para que este archivo ande solo: antes vivia alla y
// RutinasPorAsistencia.gs lo llamaba a ciegas.
// ============================================================

function normalizarTexto_(texto) {
  if (!texto) return '';
  return texto.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** La hoja Entrenamiento de numero mas alto: "Entrenamiento3" gana a "Entrenamiento". */
function encontrarHojaEntrenamiento_(spreadsheet) {
  const regex = /^entrenamiento(\d*)$/i;
  const candidatas = spreadsheet.getSheets()
    .map(function (sheet) {
      const m = sheet.getName().match(regex);
      return m ? { sheet: sheet, num: m[1] ? parseInt(m[1], 10) : -1 } : null;
    })
    .filter(Boolean);
  if (!candidatas.length) return null;
  candidatas.sort(function (a, b) { return b.num - a.num; });
  return candidatas[0].sheet;
}

/**
 * Las cuatro filas que estructuran la grilla, ubicadas desde el "DIA" de la
 * columna A. Se buscan en vez de fijarlas: no todas las planillas lo tienen en
 * la misma fila.
 */
function encontrarFilasClave_(datos) {
  for (let i = 0; i < datos.length; i++) {
    if (datos[i] && datos[i][0] && normalizarTexto_(datos[i][0].toString()).toUpperCase() === 'DIA') {
      const headerRow = i + 1;
      return { headerRow: headerRow, dateRow: headerRow - 3,
               weekRow: headerRow - 1, blockTitleRow: headerRow - 2 };
    }
  }
  return null;
}

function encontrarColumnaDeFecha_(datos, dateRow, targetDate) {
  const idxFechas = dateRow - 1;
  if (!datos[idxFechas]) return { colIndex: -1, header: null };
  const idxHeaders = dateRow + 2;
  const fila = datos[idxFechas];
  for (let i = 0; i < fila.length; i++) {
    const v = fila[i];
    if (!(v instanceof Date)) continue;
    const a = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const b = new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (a.getTime() === b.getTime()) {
      return { colIndex: i + 1, header: String(datos[idxHeaders][i] || '').toUpperCase() };
    }
  }
  return { colIndex: -1, header: null };
}

function determinarBloqueSeries_(filaHeaders, colIndex) {
  const cols = [{ start: colIndex }];
  if (String(filaHeaders[colIndex]).toUpperCase() === 'REPES') {
    cols.push({ start: colIndex + 1 });
    if (String(filaHeaders[colIndex + 1]).toUpperCase() === 'REST') {
      cols.push({ start: colIndex + 2 });
      if (String(filaHeaders[colIndex + 2]).toUpperCase() === 'PESO') {
        cols.push({ start: colIndex + 3 });
        if (!filaHeaders[colIndex + 3] && !filaHeaders[colIndex + 4]) {
          cols.push({ start: colIndex + 4, count: 2 });
        }
      }
    }
  }
  return cols;
}

function determinarBloquePeso_(filaHeaders, colIndex) {
  const cols = [{ start: colIndex }];
  ['REST', 'REPES', 'SERIES'].forEach(function (nombre) {
    for (let i = colIndex - 1; i >= 0; i--) {
      if (String(filaHeaders[i] || '').toUpperCase() === nombre
          && !cols.some(function (c) { return c.start === i + 1; })) {
        cols.push({ start: i + 1 });
        break;
      }
    }
  });
  return cols;
}

/** Los bloques SERIES de la hoja, y cual es el visible (el que el alumno ve). */
function analizarEstructuraDeBloques_(sheet, headerRow) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const bloques = headers
    .map(function (h, i) { return String(h).toUpperCase() === 'SERIES' ? { index: i, header: h } : null; })
    .filter(Boolean);
  if (!bloques.length) return { error: "No se encontraron columnas 'SERIES'." };

  for (let i = 0; i < bloques.length; i++) {
    const col = bloques[i].index;
    if (sheet.isColumnHiddenByUser(col + 1)) continue;
    const endCol = (i + 1 < bloques.length) ? bloques[i + 1].index - 1 : lastCol - 1;
    return {
      visible: { startCol: col, endCol: endCol, numColumnas: endCol - col + 1 },
      visibleIndex: i,
      todos: bloques,
    };
  }
  return { error: 'No se encontro ningun bloque visible.' };
}

function extraerTitulo_(datos, analisis, fila) {
  for (let i = analisis.visibleIndex; i >= 0; i--) {
    const t = datos[fila][analisis.todos[i].index];
    if (t) return t;
  }
  return 'Sin Titulo';
}

function extraerFecha_(datos, infoBloque, filaHeader, filaFecha) {
  let fecha = null, columna = -1;
  for (let i = infoBloque.startCol; i <= infoBloque.endCol; i++) {
    if (String(datos[filaHeader][i]).toUpperCase() === 'PESO' && datos[filaFecha][i] instanceof Date) {
      if (!fecha || datos[filaFecha][i] > fecha) { fecha = datos[filaFecha][i]; columna = i; }
    }
  }
  if (fecha) return { fecha: fecha, columna: columna };
  if (datos[filaFecha][infoBloque.startCol] instanceof Date) {
    return { fecha: datos[filaFecha][infoBloque.startCol], columna: infoBloque.startCol };
  }
  throw new Error('Fecha no encontrada.');
}

function extraerDatosDelBloque_(datos, analisis, filasClave) {
  const titulo = extraerTitulo_(datos, analisis, filasClave.blockTitleRow - 1);
  const f = extraerFecha_(datos, analisis.visible, filasClave.headerRow - 1, filasClave.dateRow - 1);
  const semana = f.columna !== -1 ? (datos[filasClave.weekRow - 1][f.columna] || '') : '';
  return { bloque: titulo, fecha: f.fecha, semana: semana };
}

/**
 * El corazon: deja visible el bloque de `fechaABuscar` y oculta el resto.
 *
 * `esRepetirSemana` reescribe la fecha del bloque encontrado con `fechaElegida`:
 * asi el alumno repite el mismo trabajo, pero fechado a la semana que viene.
 */
function procesarYExtraerEntrenamiento_(userId, fechaABuscar, esRepetirSemana, fechaElegida) {
  try {
    const ss = SpreadsheetApp.openById(userId);
    const hoja = encontrarHojaEntrenamiento_(ss);
    if (!hoja) throw new Error('Hoja de entrenamiento no encontrada');

    const datos = hoja.getDataRange().getValues();
    if (!datos.length) throw new Error('Hoja de entrenamiento vacia');

    const filasClave = encontrarFilasClave_(datos);
    if (!filasClave) throw new Error("No se encontro 'DIA' en la columna A");

    const enc = encontrarColumnaDeFecha_(datos, filasClave.dateRow, fechaABuscar);
    if (enc.colIndex === -1) {
      throw new Error('No existe un bloque fechado ' + Utilities.formatDate(
        fechaABuscar, RUT.TZ, 'dd/MM/yyyy'));
    }
    if (enc.header !== 'SERIES' && enc.header !== 'PESO') {
      throw new Error("Sobre la fecha no hay 'SERIES' ni 'PESO': la grilla tiene otro formato");
    }

    if (esRepetirSemana) {
      hoja.getRange(filasClave.dateRow, enc.colIndex).setValue(fechaElegida);
    }

    const visibles = (enc.header === 'SERIES')
      ? determinarBloqueSeries_(datos[filasClave.headerRow - 1], enc.colIndex)
      : determinarBloquePeso_(datos[filasClave.headerRow - 1], enc.colIndex);

    if (hoja.getLastColumn() > 3) hoja.hideColumns(4, hoja.getLastColumn() - 3);
    visibles.forEach(function (c) { hoja.showColumns(c.start, c.count || 1); });
    SpreadsheetApp.flush();

    const analisis = analizarEstructuraDeBloques_(hoja, filasClave.headerRow);
    if (analisis.error) throw new Error(analisis.error);

    return {
      rutinaStatus: 'Actualizada',
      entrenamientoInfo: extraerDatosDelBloque_(hoja.getDataRange().getValues(), analisis, filasClave),
    };
  } catch (e) {
    return { rutinaStatus: 'Fallo total', entrenamientoInfo: { error: e.message } };
  }
}

// ---------- RMs: lo que corre ANTES de avanzar ----------

function encontrarUltimaFilaDia_(datos, filaInicial) {
  let ultima = filaInicial;
  for (let i = filaInicial - 1; i < datos.length; i++) {
    if (datos[i] && datos[i][0] && datos[i][0].toString().trim() !== '') ultima = i + 1;
    else break;
  }
  return ultima;
}

/**
 * Copia el bloque de dos semanas atras al que viene, respetando los ejercicios
 * marcados "(Programa)", que llevan su propia progresion y no se pisan.
 */
function copiarBloqueAnterior_(hoja, filasClave, analisis, ultimaFilaDia) {
  try {
    const i = analisis.visibleIndex;
    if (i < 2 || i >= analisis.todos.length - 1) return;

    const fuente = analisis.todos[i - 2];
    const destino = analisis.todos[i + 1];
    const colFuente = fuente.index + 1;
    const colDestino = destino.index + 1;
    const numColumnas = (colFuente + 3 - colFuente) + 1;
    const numFilas = ultimaFilaDia - 10;

    const valoresFuente = hoja.getRange(11, colFuente, numFilas, numColumnas).getValues();
    const rangoDestino = hoja.getRange(11, colDestino, numFilas, numColumnas);
    const valoresDestino = rangoDestino.getValues();
    const ejercicios = hoja.getRange(11, 3, numFilas, 1).getValues();

    const nuevos = valoresFuente.map(function (fila, k) {
      const ej = ejercicios[k][0] ? ejercicios[k][0].toString() : '';
      return ej.toLowerCase().indexOf('(programa)') !== -1 ? valoresDestino[k] : fila;
    });
    rangoDestino.setValues(nuevos);
  } catch (e) {
    Logger.log('ERROR en copiarBloqueAnterior_: ' + e.message);
  }
}

/**
 * Levanta los RMs de la semana de test y los deja en Prog1 y en Avances.
 *
 * Un RM es la fila con SERIES=1 y REPES=1. Si un dia tiene mas de uno no se
 * toca nada: no se puede saber cual es el bueno.
 */
function cargarRMs_(hojaEntrenamiento, hojaProg1, datos, filasClave, analisis) {
  const bloque = analisis.visible;
  const completos = hojaEntrenamiento.getDataRange().getValues();
  const mapa = {};
  datos[filasClave.headerRow - 1]
    .slice(bloque.startCol, bloque.endCol + 1)
    .forEach(function (h, i) { mapa[h.toString().toUpperCase().trim()] = i; });
  if (mapa['SERIES'] === undefined || mapa['REPES'] === undefined || mapa['PESO'] === undefined) return;

  const rmsPorDia = {};
  for (let i = filasClave.headerRow; i < completos.length; i++) {
    const dia = completos[i][0] ? completos[i][0].toString().trim() : '';
    if (!dia) continue;
    if (completos[i][bloque.startCol + mapa['SERIES']] == 1
        && completos[i][bloque.startCol + mapa['REPES']] == 1) {
      if (!rmsPorDia[dia]) rmsPorDia[dia] = [];
      rmsPorDia[dia].push({
        peso: completos[i][bloque.startCol + mapa['PESO']],
        ejercicio: completos[i][2],
      });
    }
  }
  for (const dia in rmsPorDia) if (rmsPorDia[dia].length > 1) return;

  const celdas = {
    'Lunes':     { peso: 'B8',  ejercicio: 'A1'  },
    'Martes':    { peso: 'B18', ejercicio: 'A11' },
    'Miércoles': { peso: 'B28', ejercicio: 'A21' },
    'Jueves':    { peso: 'G8',  ejercicio: 'F1'  },
    'Viernes':   { peso: 'G18', ejercicio: 'F11' },
    'Sábado':    { peso: 'G28', ejercicio: 'F21' },
  };
  for (const dia in rmsPorDia) {
    if (!celdas[dia]) continue;
    const rm = rmsPorDia[dia][0];
    const peso = parseFloat(rm.peso);
    if (isNaN(peso)) continue;
    const redondeado = Math.round(peso / 2.5) * 2.5;
    const nombre = rm.ejercicio.replace(/\(Programa\)/i, '').trim().toUpperCase();
    hojaProg1.getRange(celdas[dia].peso).setValue(redondeado);
    hojaProg1.getRange(celdas[dia].ejercicio).setValue('PROGRAMA DE ' + nombre);
  }

  // Y ademas quedan registrados en "Avances", con la fecha del bloque.
  try {
    const avances = hojaEntrenamiento.getParent().getSheetByName('Avances');
    if (!avances) return;
    const fechaBloque = datos[filasClave.blockTitleRow - 2][bloque.startCol];
    if (!(fechaBloque instanceof Date)) return;

    const colC = avances.getRange('C1:C' + avances.getMaxRows()).getValues();
    const buscada = new Date(fechaBloque); buscada.setHours(0, 0, 0, 0);
    let filaDestino = -1;
    for (let i = 0; i < colC.length; i++) {
      if (!(colC[i][0] instanceof Date)) continue;
      const c = new Date(colC[i][0]); c.setHours(0, 0, 0, 0);
      if (c.getTime() === buscada.getTime()) { filaDestino = i + 1; break; }
    }
    if (filaDestino === -1) {
      filaDestino = colC.findIndex(function (r) { return r[0] === ''; }) + 1;
      if (filaDestino === 0) filaDestino = avances.getLastRow() + 1;
      avances.getRange(filaDestino, 3).setValue(fechaBloque);
    }

    const datosAv = avances.getDataRange().getValues();
    const filaEnc = datosAv.findIndex(function (f) {
      return f.some(function (c) { return c.toString().trim() === 'Fechas RM'; });
    });
    if (filaEnc === -1) return;
    const mapaEnc = {};
    datosAv[filaEnc].forEach(function (h, i) { if (h) mapaEnc[normalizarTexto_(h)] = i + 1; });

    for (const dia in rmsPorDia) {
      const rm = rmsPorDia[dia][0];
      let nombre = normalizarTexto_(rm.ejercicio.replace(/\(programa\)/i, ''));
      if (nombre.indexOf('peso muerto sumo') !== -1) nombre = normalizarTexto_('Peso Muerto S');
      const col = mapaEnc[nombre];
      const peso = parseFloat(rm.peso);
      if (col && !isNaN(peso)) {
        avances.getRange(filaDestino, col).setValue(Math.round(peso / 2.5) * 2.5);
      }
    }
  } catch (e) {
    Logger.log("ERROR registrando RMs en 'Avances': " + e.message);
  }
}

/**
 * Lo que hay que hacer antes de avanzar, cuando la semana que se cierra era de
 * test: levantar los RMs. Si no lo es, no hace nada.
 */
function realizarTareasPreActualizacion_(userId) {
  try {
    const ss = SpreadsheetApp.openById(userId);
    const hoja = encontrarHojaEntrenamiento_(ss);
    const prog1 = ss.getSheetByName('Prog1');
    if (!hoja || !prog1) return;

    const datos = hoja.getDataRange().getValues();
    const filasClave = encontrarFilasClave_(datos);
    if (!filasClave) return;
    const analisis = analizarEstructuraDeBloques_(hoja, filasClave.headerRow);
    if (analisis.error || !analisis.visible) return;

    const col = analisis.visible.startCol;
    const fila = filasClave.headerRow;
    const t1 = datos[fila - 2][col] ? datos[fila - 2][col].toString().trim().toUpperCase() : '';
    const t2 = datos[fila - 3][col] ? datos[fila - 3][col].toString().trim().toUpperCase() : '';

    if (t1 === 'TEST RM' || t2 === 'TEST RM') {
      cargarRMs_(hoja, prog1, datos, filasClave, analisis);
      return;
    }
    if (t2 === 'AL MÁXIMO (RM)') {
      const ultimaFilaDia = encontrarUltimaFilaDia_(datos, 11);
      // Se congelan las formulas antes de copiar: si no, al mover el bloque
      // apuntan a celdas que dejaron de ser las de esa semana.
      const rango = hoja.getRange(11, 4, ultimaFilaDia - 10, col - 3);
      rango.setValues(rango.getValues());
      cargarRMs_(hoja, prog1, datos, filasClave, analisis);

      const headers = datos[filasClave.headerRow - 1];
      let colPeso = -1;
      for (let i = analisis.visible.startCol; i <= analisis.visible.endCol; i++) {
        if (headers[i] && headers[i].toString().trim().toUpperCase() === 'PESO') { colPeso = i; break; }
      }
      if (colPeso !== -1 && !hoja.getRange(14, colPeso + 2).getFormula()) {
        copiarBloqueAnterior_(hoja, filasClave, analisis, ultimaFilaDia);
      }
    }
  } catch (e) {
    Logger.log('ERROR en tareas de pre-actualizacion: ' + e.message);
  }
}
