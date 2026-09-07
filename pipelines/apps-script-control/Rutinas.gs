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
 * Va en el mismo proyecto de Apps Script que Pipelines.gs: le reusa la secret.
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

/**
 * Acepta una hoja ya abierta o el id de la planilla.
 *
 * Abrir un spreadsheet y enumerarle las hojas cuesta cerca de un segundo, y
 * avanzar lo hacia dos veces: una para revisar los RMs y otra para mover el
 * bloque. Pasando la hoja ya abierta se paga una sola vez.
 */
function rutHoja_(hojaOId) {
  if (typeof hojaOId !== 'string') return hojaOId;
  const hoja = encontrarHojaEntrenamiento_(SpreadsheetApp.openById(hojaOId));
  if (!hoja) throw new Error('Hoja de entrenamiento no encontrada');
  return hoja;
}

/** El alumno a probar. Alcanza con parte del apellido. */
const APELLIDO = 'CAMBIAR_APELLIDO_ACA';

// Para ensayar sobre una copia: con un id aca, se ignora APELLIDO y se trabaja
// sobre esa planilla. Sirve para ver escribir a avanzarUno sin arriesgar la
// planilla de un alumno. Vaciar cuando se termina de probar.
const SHEET_ID_PRUEBA = '';

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

/**
 * Que haria el paso de RMs en la planilla de APELLIDO, SIN escribir nada.
 *
 * Recorre el mismo camino que la corrida real —la unica diferencia es que los
 * valores se anotan en vez de guardarse— asi que lo que informa es exactamente
 * lo que pasaria al avanzar.
 */
function probarRMs() {
  const a = rutBuscarAlumno_(APELLIDO);
  if (!a) return;
  const plan = [];
  realizarTareasPreActualizacion_(a.sheet_id, plan);

  const lineas = ['RMs — ' + a.apellido + ', ' + a.nombre,
                  'https://docs.google.com/spreadsheets/d/' + a.sheet_id, ''];
  if (!plan.length) {
    lineas.push('No haria nada (y no llego a mirar los titulos: revisa que la hoja');
    lineas.push('tenga Prog1 y que la columna A tenga el "DIA").');
  }
  plan.forEach(function (x) {
    if (x.detectado) lineas.push('  RM detectado  ' + _pad_(x.dia, 12)
      + _pad_(String(x.peso), 8) + _pad_(x.esNumero ? '' : 'PESO NO NUMERICO', 18)
      + _pad_(x.tieneCelda ? '' : 'DIA SIN CELDA EN PROG1', 24) + x.ejercicio
      + '\n                fila ' + x.nroFila + ': [' + (x.fila || []).map(String).join('] [') + ']');
    else if (x.encBloque) lineas.push('  columnas del bloque: ' + x.encBloque.map(String).join(' | '));
    else if (x.encabezados) lineas.push('  columnas de Avances: ' + x.encabezados.join(' | '));
    else if (x.titulos) lineas.push(x.titulos);
    else if (x.aborta) lineas.push('SE DETIENE: ' + x.aborta);
    else if (x.aviso) lineas.push('AVISO: ' + x.aviso);
    else lineas.push('  escribiria  ' + _pad_(x.hoja + '!' + x.celda, 24) + ' = ' + x.valor
      + (x.ejercicio ? '   (' + x.ejercicio + ')' : ''));
  });
  lineas.push('');
  lineas.push('(no se escribio nada)');
  Logger.log(lineas.join('\n'));
}

/**
 * Quienes estan hoy en semana de test. Solo lee.
 *
 * Sin esto no hay a quien probarle el paso de RMs: son la excepcion, y buscarlos
 * a mano es abrir planillas de a una.
 */
function buscarSemanasDeTest() {
  const alumnos = rutGet_('alumnos_cuenta?select=apellido,nombre,sheet_id'
    + '&sheet_id=not.is.null&ultima_actividad=gte.'
    + new Date(Date.now() - 30 * 86400000).toISOString());
  Logger.log('Revisando ' + alumnos.length + ' alumnos con actividad reciente...');

  const encontrados = [];
  const t0 = Date.now();
  let mirados = 0;
  for (let i = 0; i < alumnos.length; i++) {
    if (Date.now() - t0 > 4.5 * 60 * 1000) break;
    const a = alumnos[i];
    try {
      const hoja = rutHoja_(a.sheet_id);
      const colA = hoja.getRange(1, 1, Math.min(hoja.getLastRow(), 30), 1).getValues();
      const clave = encontrarFilasClave_(colA);
      if (!clave) continue;
      const r = rutBloqueVisibleRapido_(a.sheet_id, hoja.getName(), clave.headerRow);
      mirados++;
      if (!r) continue;
      if (rutEsDeTest_(r.t1, r.t2)) {
        const cual = (r.t1 === 'AL MÁXIMO (RM)' || r.t2 === 'AL MÁXIMO (RM)')
          ? 'AL MAXIMO (RM)' : 'TEST RM';
        encontrados.push('  ' + _pad_(a.apellido + ', ' + a.nombre, 34) + cual);
      }
    } catch (e) { /* una planilla rota no frena la busqueda */ }
  }

  Logger.log(['Mirados: ' + mirados + ' de ' + alumnos.length
    + '  (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)', '',
    encontrados.length ? 'EN SEMANA DE TEST:' : 'Ninguno esta en semana de test ahora mismo.',
    encontrados.join('\n'), '',
    'Pone uno de estos en APELLIDO y corre probarRMs.'].join('\n'));
}

function rutCorrerUno_(accion) {
  const t0 = Date.now();
  const a = rutBuscarAlumno_(APELLIDO);
  if (!a) return;
  const f = rutFechas_();
  const runId = Utilities.getUuid();
  const quien = a.apellido + ', ' + a.nombre;
  let tPre = 0;

  try {
    let r;
    if (accion === 'avanzar') {
      // Los RMs se cargan antes de mover el bloque: despues, la semana de test
      // ya no esta visible y no hay de donde leerlos.
      const tp = Date.now();
      realizarTareasPreActualizacion_(a.sheet_id);
      tPre = Date.now() - tp;
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
    const total = Date.now() - t0;
    Logger.log([
      accion.toUpperCase() + ' OK — ' + quien,
      '  bloque : ' + info.bloque,
      '  fecha  : ' + (info.fecha instanceof Date ? _ymd_(info.fecha) : info.fecha),
      '  semana : ' + info.semana,
      '',
      '  tardo  : ' + (total / 1000).toFixed(1) + 's'
        + (tPre ? '   (de eso, RMs: ' + (tPre / 1000).toFixed(1) + 's)' : ''),
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
  if (SHEET_ID_PRUEBA) {
    Logger.log('OJO: SHEET_ID_PRUEBA esta puesto, se ignora APELLIDO.');
    return { apellido: '(copia', nombre: 'de prueba)', sheet_id: SHEET_ID_PRUEBA };
  }
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

/** Rellena a la derecha, para alinear las columnas de los informes. */
function _pad_(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

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
  return rutFechasDe_(new Date(hoy.getTime() + aLunes * 86400000));
}

/**
 * Las mismas dos fechas, pero a partir de un lunes dado en vez de hoy.
 *
 * `lunes0` es medianoche del lunes que ABRIO la semana que se cierra.
 */
function rutFechasDe_(lunes0) {
  return {
    lunesEsta: new Date(lunes0.getTime() + 12 * 3600000),
    lunesProx: new Date(lunes0.getTime() + 7 * 86400000 + 12 * 3600000),
  };
}

// ============================================================
// SUPABASE
// ============================================================

/**
 * Usa la misma secret que Pipelines.gs, no una propia.
 *
 * Las Script Properties son del proyecto, no del archivo: si los dos comparten
 * proyecto, la que cargo `setSecrets` sirve para los dos. Tener una clave
 * aparte solo agregaba una forma de romperlo —guardar el placeholder por error
 * y que tapara a la buena—.
 *
 * En un proyecto donde no este Pipelines.gs, hay que cargar a mano la propiedad
 * DEST_SUPABASE_SECRET con la legacy service_role.
 */
function rutHeaders_() {
  const cruda = PropertiesService.getScriptProperties()
    .getProperty('DEST_SUPABASE_SECRET') || '';
  const secret = cruda.replace(/\s+/g, '');
  if (!secret || secret.indexOf('eyJ') !== 0) {
    throw new Error('Falta la secret legacy service_role en DEST_SUPABASE_SECRET. '
      + 'La carga setSecrets, en Pipelines.gs.');
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

/**
 * Una linea en `pipeline_logs`.
 *
 * `pipeline` es opcional y por defecto es la corrida semanal. Lo que entra por
 * el mostrador loguea con otro nombre a proposito: la pantalla de Pipelines
 * mide el atraso con la ultima corrida de cada uno, y una actualizacion a mano
 * haria pasar por vivo a un trigger muerto.
 */
function rutLog_(runId, nivel, mensaje, contexto, pipeline) {
  try {
    UrlFetchApp.fetch(RUT.SUPA_URL + '/rest/v1/pipeline_logs', {
      method: 'post',
      contentType: 'application/json',
      headers: Object.assign(rutHeaders_(), { Prefer: 'return=minimal' }),
      payload: JSON.stringify([{
        run_id: runId, pipeline: pipeline || 'UpdateAthleteProgram', nivel: nivel,
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




/**
 * El corazon: deja visible el bloque de `fechaABuscar` y oculta el resto.
 *
 * `esRepetirSemana` reescribe la fecha del bloque encontrado con `fechaElegida`:
 * asi el alumno repite el mismo trabajo, pero fechado a la semana que viene.
 *
 * NO lee la planilla entera. Antes hacia dos `getDataRange().getValues()` —una
 * antes y otra despues de mover— y en estas hojas eso son cientos de columnas
 * por decenas de filas, dos veces. Ahora lee la columna A para ubicar el "DIA"
 * y despues solo las cuatro filas de la grilla, que es todo lo que se usa.
 *
 * El titulo, la fecha y la semana que devuelve salen de esas mismas cuatro
 * filas, sin volver a leer y sin recorrer las columnas una por una.
 */
function procesarYExtraerEntrenamiento_(hojaOId, fechaABuscar, esRepetirSemana, fechaElegida) {
  try {
    const hoja = rutHoja_(hojaOId);
    const lastCol = hoja.getLastColumn();
    if (lastCol < 4) throw new Error('La hoja no tiene bloques de entrenamiento');

    // 1) Solo la columna A, para ubicar la fila del "DIA".
    const colA = hoja.getRange(1, 1, Math.min(hoja.getLastRow(), 30), 1).getValues();
    const filasClave = encontrarFilasClave_(colA);
    if (!filasClave) throw new Error("No se encontro 'DIA' en la columna A");

    // 2) Las cuatro filas de la grilla, de una. Se arma un arreglo ralo indexado
    //    por fila absoluta para que los helpers sigan andando sin tocarlos.
    const cuatro = hoja.getRange(filasClave.dateRow, 1, 4, lastCol).getValues();
    const datos = [];
    for (let k = 0; k < 4; k++) datos[filasClave.dateRow - 1 + k] = cuatro[k];

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

    const filaHeaders = datos[filasClave.headerRow - 1];
    const visibles = (enc.header === 'SERIES')
      ? determinarBloqueSeries_(filaHeaders, enc.colIndex)
      : determinarBloquePeso_(filaHeaders, enc.colIndex);

    hoja.hideColumns(4, lastCol - 3);
    visibles.forEach(function (c) { hoja.showColumns(c.start, c.count || 1); });

    // El titulo es el ultimo no vacio hacia la izquierda: los bloques comparten
    // encabezado y solo el primero de cada tanda lo lleva escrito.
    const col0 = enc.colIndex - 1;
    const filaTitulo = datos[filasClave.blockTitleRow - 1];
    let bloque = 'Sin Titulo';
    for (let i = col0; i >= 0; i--) {
      if (filaTitulo[i]) { bloque = filaTitulo[i]; break; }
    }

    return {
      rutinaStatus: 'Actualizada',
      entrenamientoInfo: {
        bloque: bloque,
        fecha: esRepetirSemana ? fechaElegida : datos[filasClave.dateRow - 1][col0],
        semana: datos[filasClave.weekRow - 1][col0] || '',
      },
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
/** Donde va el RM de cada dia en Prog1. */
const CELDAS_PROG1 = {
  'Lunes':     { peso: 'B8',  ejercicio: 'A1'  },
  'Martes':    { peso: 'B18', ejercicio: 'A11' },
  'Miércoles': { peso: 'B28', ejercicio: 'A21' },
  'Jueves':    { peso: 'G8',  ejercicio: 'F1'  },
  'Viernes':   { peso: 'G18', ejercicio: 'F11' },
  'Sábado':    { peso: 'G28', ejercicio: 'F21' },
};

/** La celda de ese dia, o null si el nombre no coincide con ninguno esperado. */
function celdasSiExiste_(dia) {
  return CELDAS_PROG1[dia] || null;
}

/**
 * Escribe, o anota lo que escribiria.
 *
 * `plan` es null en una corrida normal y un arreglo en modo seco. Asi el modo
 * de prueba recorre EXACTAMENTE el mismo camino que el real —no una copia que
 * se puede desincronizar— y lo unico que cambia es el destino del valor.
 */
function rutEscribir_(plan, hoja, celda, valor) {
  if (plan) {
    plan.push({ hoja: hoja.getName(), celda: celda, valor: valor });
    return;
  }
  hoja.getRange(celda).setValue(valor);
}

function cargarRMs_(hojaEntrenamiento, hojaProg1, datos, filasClave, analisis, plan) {
  const bloque = analisis.visible;
  const completos = hojaEntrenamiento.getDataRange().getValues();
  const mapa = {};
  datos[filasClave.headerRow - 1]
    .slice(bloque.startCol, bloque.endCol + 1)
    .forEach(function (h, i) { mapa[h.toString().toUpperCase().trim()] = i; });
  if (mapa['SERIES'] === undefined || mapa['REPES'] === undefined || mapa['PESO'] === undefined) return;

  const encBloque = datos[filasClave.headerRow - 1].slice(bloque.startCol, bloque.endCol + 1);
  if (plan) plan.push({ encBloque: encBloque });

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
        fila: completos[i].slice(bloque.startCol, bloque.endCol + 1),
        nroFila: i + 1,
      });
    }
  }
  for (const dia in rmsPorDia) {
    if (rmsPorDia[dia].length > 1) {
      if (plan) plan.push({ aborta: 'el ' + dia + ' tiene ' + rmsPorDia[dia].length
        + ' RMs: no se puede saber cual vale' });
      return;
    }
  }
  if (plan && !Object.keys(rmsPorDia).length) plan.push({ aborta: 'no hay ninguna fila con SERIES=1 y REPES=1' });

  // Lo detectado, tal cual salio de la hoja. Sin esto no hay forma de saber por
  // que un RM no se escribio: si el dia no coincide, si el peso no es numero, o
  // si el ejercicio no tiene columna.
  if (plan) {
    for (const dia in rmsPorDia) {
      const rm = rmsPorDia[dia][0];
      plan.push({ detectado: true, dia: dia, ejercicio: rm.ejercicio, peso: rm.peso,
                  esNumero: !isNaN(parseFloat(rm.peso)),
                  tieneCelda: !!celdasSiExiste_(dia),
                  fila: rm.fila, nroFila: rm.nroFila });
    }
  }

  const celdas = CELDAS_PROG1;
  for (const dia in rmsPorDia) {
    if (!celdas[dia]) continue;
    const rm = rmsPorDia[dia][0];
    const peso = parseFloat(rm.peso);
    if (isNaN(peso)) continue;
    const redondeado = Math.round(peso / 2.5) * 2.5;
    const nombre = rm.ejercicio.replace(/\(Programa\)/i, '').trim().toUpperCase();
    rutEscribir_(plan, hojaProg1, celdas[dia].peso, redondeado);
    rutEscribir_(plan, hojaProg1, celdas[dia].ejercicio, 'PROGRAMA DE ' + nombre);
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
      if (plan) plan.push({ hoja: 'Avances', celda: 'C' + filaDestino,
        valor: _ymd_(fechaBloque) + '  (fila nueva)' });
      else avances.getRange(filaDestino, 3).setValue(fechaBloque);
    }

    const datosAv = avances.getDataRange().getValues();
    const filaEnc = datosAv.findIndex(function (f) {
      return f.some(function (c) { return c.toString().trim() === 'Fechas RM'; });
    });
    if (filaEnc === -1) return;
    const mapaEnc = {};
    datosAv[filaEnc].forEach(function (h, i) { if (h) mapaEnc[normalizarTexto_(h)] = i + 1; });
    if (plan) plan.push({ encabezados: Object.keys(mapaEnc) });

    for (const dia in rmsPorDia) {
      const rm = rmsPorDia[dia][0];
      let nombre = normalizarTexto_(rm.ejercicio.replace(/\(programa\)/i, ''));
      if (nombre.indexOf('peso muerto sumo') !== -1) nombre = normalizarTexto_('Peso Muerto S');
      const col = mapaEnc[nombre];
      const peso = parseFloat(rm.peso);
      if (col && !isNaN(peso)) {
        if (plan) plan.push({ hoja: 'Avances', celda: 'fila ' + filaDestino + ', col ' + col,
          valor: Math.round(peso / 2.5) * 2.5, ejercicio: rm.ejercicio });
        else avances.getRange(filaDestino, col).setValue(Math.round(peso / 2.5) * 2.5);
      } else if (plan) {
        plan.push({ aviso: !col
          ? 'el ejercicio "' + nombre + '" (de "' + rm.ejercicio + '") no tiene columna en Avances'
          : 'el peso "' + rm.peso + '" del ' + dia + ' no es un numero: ese RM no se registra' });
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
/**
 * Cual es el bloque visible y que dicen los dos titulos de arriba, en UNA sola
 * llamada a la API de Sheets.
 *
 * `analizarEstructuraDeBloques_` preguntaba `isColumnHiddenByUser` columna por
 * columna: en una hoja con cien bloques son cien idas y vueltas. La API devuelve
 * el estado de todas las columnas y las filas que hacen falta de un saque.
 *
 * Devuelve null si no se puede determinar, y ahi el llamador cae al camino lento.
 */
/**
 * Si el bloque que se cierra es de test. t2 es blockTitleRow y t1 weekRow.
 *
 * "TEST RM" puede estar en cualquiera de las dos; "AL MÁXIMO (RM)" es un titulo
 * y solo se busca en t2. Compartido entre el atajo y el camino lento para que
 * no se separen: cuando se separaron, el atajo leia una fila de mas arriba y
 * daba que ninguna semana era de test.
 */
function rutEsDeTest_(t1, t2) {
  return t1 === 'TEST RM' || t2 === 'TEST RM' || t2 === 'AL MÁXIMO (RM)';
}

function rutBloqueVisibleRapido_(sheetId, nombreHoja, headerRow) {
  try {
    const rangos = ['A1:A30', (headerRow - 3) + ':' + headerRow]
      .map(function (r) { return 'ranges=' + encodeURIComponent("'" + nombreHoja + "'!" + r); })
      .join('&');
    const res = UrlFetchApp.fetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '?' + rangos
      + '&includeGridData=true&fields=sheets(data(columnMetadata(hiddenByUser),'
      + 'rowData(values(formattedValue,effectiveValue))))',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;

    const data = (JSON.parse(res.getContentText()).sheets || [])[0].data;
    const grilla = data[1];
    const meta = grilla.columnMetadata || [];
    const filas = (grilla.rowData || []).map(function (f) { return f.values || []; });
    const enc = filas[3] || [];   // headerRow es la cuarta del rango

    const txt = function (c) {
      return String((c && (c.formattedValue
        || (c.effectiveValue && c.effectiveValue.stringValue))) || '').trim();
    };

    for (let i = 0; i < enc.length; i++) {
      if (txt(enc[i]).toUpperCase() !== 'SERIES') continue;
      if (meta[i] && meta[i].hiddenByUser) continue;
      // Las MISMAS filas que mira el camino lento. Ahi los indices son
      // datos[headerRow-2] y datos[headerRow-3] sobre un arreglo 0-indexado,
      // que caen en las filas headerRow-1 (weekRow) y headerRow-2
      // (blockTitleRow). Leer una fila mas arriba daba la de fechas, y el
      // titulo nunca aparecia.
      return {
        startCol: i,
        t1: txt((filas[2] || [])[i]).toUpperCase(),   // weekRow
        t2: txt((filas[1] || [])[i]).toUpperCase(),   // blockTitleRow
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function realizarTareasPreActualizacion_(hojaOId, plan) {
  try {
    const hoja = rutHoja_(hojaOId);
    const ss = hoja.getParent();
    const prog1 = ss.getSheetByName('Prog1');
    if (!prog1) return;

    // Atajo: la mayoria de las semanas NO son de test, y averiguarlo no
    // justifica leer la hoja entera ni recorrerle las columnas de a una.
    const colA = hoja.getRange(1, 1, Math.min(hoja.getLastRow(), 30), 1).getValues();
    const clave = encontrarFilasClave_(colA);
    if (!clave) return;

    const rapido = rutBloqueVisibleRapido_(ss.getId(), hoja.getName(), clave.headerRow);
    if (rapido && !rutEsDeTest_(rapido.t1, rapido.t2)) {
      if (plan) plan.push({ titulos: 'arriba del bloque dice: "' + rapido.t2 + '" / "'
        + rapido.t1 + '" — no es semana de test, no hay nada que hacer' });
      return;
    }

    // Es semana de test —o no se pudo determinar—: recien aca se paga la
    // lectura completa, que cargarRMs_ necesita entera.
    const datos = hoja.getDataRange().getValues();
    const filasClave = encontrarFilasClave_(datos);
    if (!filasClave) return;
    const analisis = analizarEstructuraDeBloques_(hoja, filasClave.headerRow);
    if (analisis.error || !analisis.visible) return;

    const col = analisis.visible.startCol;
    const fila = filasClave.headerRow;
    const t1 = datos[fila - 2][col] ? datos[fila - 2][col].toString().trim().toUpperCase() : '';
    const t2 = datos[fila - 3][col] ? datos[fila - 3][col].toString().trim().toUpperCase() : '';

    if (plan) plan.push({ titulos: 'arriba del bloque dice: "' + t2 + '" / "' + t1 + '"' });

    if (t1 === 'TEST RM' || t2 === 'TEST RM') {
      cargarRMs_(hoja, prog1, datos, filasClave, analisis, plan);
      return;
    }
    if (t2 === 'AL MÁXIMO (RM)') {
      const ultimaFilaDia = encontrarUltimaFilaDia_(datos, 11);
      // Se congelan las formulas antes de copiar: si no, al mover el bloque
      // apuntan a celdas que dejaron de ser las de esa semana.
      const rango = hoja.getRange(11, 4, ultimaFilaDia - 10, col - 3);
      if (plan) plan.push({ aviso: 'congelaria las formulas de ' + rango.getA1Notation() });
      else rango.setValues(rango.getValues());
      cargarRMs_(hoja, prog1, datos, filasClave, analisis, plan);

      const headers = datos[filasClave.headerRow - 1];
      let colPeso = -1;
      for (let i = analisis.visible.startCol; i <= analisis.visible.endCol; i++) {
        if (headers[i] && headers[i].toString().trim().toUpperCase() === 'PESO') { colPeso = i; break; }
      }
      if (colPeso !== -1 && !hoja.getRange(14, colPeso + 2).getFormula()) {
        if (plan) plan.push({ aviso: 'copiaria el bloque de dos semanas atras al siguiente' });
        else copiarBloqueAnterior_(hoja, filasClave, analisis, ultimaFilaDia);
      }
    }
  } catch (e) {
    Logger.log('ERROR en tareas de pre-actualizacion: ' + e.message);
  }
}

// ==========================================================
// CORRIDA SEMANAL — domingos 3am
// ==========================================================

const RUTS = {
  MAX_RUNTIME_MS: 5 * 60 * 1000,   // corta antes del limite duro de 6 min
  RETRASO_TRIGGER_MS: 60 * 1000,
};
const PROP_RUT_SEMANA = 'RUTINAS_SEMANA';
const PROP_RUT_FALLADOS = 'RUTINAS_FALLADOS';
const PROP_RUT_FORZADA = 'RUTINAS_SEMANA_FORZADA';

/**
 * El lunes que abrio la semana que quedo sin cerrar, para `correrSemanaPerdida`.
 *
 * Solo se usa cuando el domingo no corrio y se recupera a mano. La corrida
 * normal no lo mira.
 */
const SEMANA_PERDIDA = '2026-08-31';

/**
 * Las fechas de esta corrida.
 *
 * Normalmente son las de hoy. Cuando `correrSemanaPerdida` dejo puesta una
 * semana forzada, son las de esa semana: la corrida tiene que poder mirar los
 * check-ins de la semana pasada, y `rutFechas_` mira el reloj.
 *
 * Va por property y no por parametro porque la continuacion —el trigger
 * `after()` que se arma cuando la corrida se queda sin tiempo— llama a
 * `rutinasSemanales()` sin argumentos: si el override fuera un parametro, el
 * segundo tramo volveria a las fechas de hoy y abriria otra semana.
 */
function rutFechasCorrida_() {
  const forzada = PropertiesService.getScriptProperties().getProperty(PROP_RUT_FORZADA);
  return forzada ? rutFechasDe_(rutLunes_(forzada)) : rutFechas_();
}

/** Medianoche del lunes `yyyy-MM-dd`. Falla si esa fecha no es un lunes. */
function rutLunes_(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error('Fecha invalida: ' + ymd);
  const d = new Date(ymd + 'T00:00:00-03:00');
  if (isNaN(d.getTime())) throw new Error('Fecha invalida: ' + ymd);
  if (d.getUTCDay() !== 1) throw new Error(ymd + ' no es un lunes');
  return d;
}

/**
 * Si el umbral decide o no.
 *
 * En `false` avanza todo el que haya venido al menos un dia: nadie repite por
 * no haber llegado a la mitad. La logica del umbral queda entera abajo, lista
 * para volver a prenderla poniendo esto en `true`.
 *
 * Seguir viniendo un dia y quedarse clavado en el mismo bloque era peor que
 * avanzar de menos: el que baja el ritmo una semana no tiene por que empezar de
 * nuevo.
 */
const UMBRAL_ACTIVO = false;

/**
 * Cuantos dias tiene que haber entrenado para pasar de bloque.
 * 1 o 2 dias -> 1 | 3 o 4 -> 2 | 5 o 6 -> 3. Es la mitad, redondeando arriba.
 *
 * Inactivo mientras `UMBRAL_ACTIVO` sea `false`.
 */
function umbralAvance_(dias) {
  return Math.ceil(dias / 2);
}

function rutMail_(m) {
  return String(m || '').trim().toLowerCase();
}

/** GET paginado: PostgREST corta en 1000 filas y hay 1900 alumnos. */
function rutGetAll_(pathQuery) {
  const out = [];
  let offset = 0;
  for (;;) {
    const page = rutGet_(pathQuery + '&limit=1000&offset=' + offset);
    Array.prototype.push.apply(out, page);
    if (page.length < 1000) return out;
    offset += 1000;
  }
}

function rutPatch_(pathQuery, body) {
  const res = UrlFetchApp.fetch(RUT.SUPA_URL + '/rest/v1/' + pathQuery, {
    method: 'patch',
    contentType: 'application/json',
    headers: rutHeaders_(),
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase PATCH ' + pathQuery + ': ' + res.getContentText());
  }
}

/**
 * A quien le toca esta semana y que hay que hacerle.
 *
 * Entra el que hizo al menos un check-in en la semana. Con `UMBRAL_ACTIVO` en
 * `true` avanza el que llego al umbral de sus dias y el resto repite, que es el
 * mismo trabajo con la fecha corrida una semana; con el umbral inactivo —como
 * esta hoy— avanzan todos los de la cola.
 *
 * Los dias salen de `dias_entrenamiento` y no de la vista `alumnos_cuenta`: la
 * vista los toma de `alumnos_tracking`, que recien los tiene despues de un
 * rebuildTracking. Leer la tabla directo saca esa dependencia del medio.
 *
 * El que ya quedo en la semana que viene no vuelve a entrar. Ahi esta el
 * progreso entre ejecuciones, y de paso hace imposible avanzarlo dos veces.
 */
function colaRutinas_(f) {
  const semana = _ymd_(f.lunesProx);
  const desde = _ymd_(f.lunesEsta) + 'T00:00:00-03:00';
  // La ventana se cierra: en la corrida del domingo no hay nada despues, pero
  // recuperando una semana a mano ya pasaron dias, y esos check-ins son de la
  // semana siguiente. Sin el tope entraria a la cola el que no vino esa semana
  // pero si despues, y contaria dias que no son de la semana que se cierra.
  const hasta = _ymd_(f.lunesProx) + 'T00:00:00-03:00';

  // Dias distintos, no check-ins: dos entradas el mismo dia son un dia.
  const fue = {};
  rutGetAll_('check_ins?select=user_email,check_in_time'
    + '&check_in_time=gte.' + encodeURIComponent(desde)
    + '&check_in_time=lt.' + encodeURIComponent(hasta)).forEach(function (c) {
    const mail = rutMail_(c.user_email);
    if (!mail) return;
    if (!fue[mail]) fue[mail] = {};
    fue[mail][Utilities.formatDate(new Date(c.check_in_time), RUT.TZ, 'yyyy-MM-dd')] = true;
  });

  const dias = {};
  rutGetAll_('dias_entrenamiento?select=gmail,dias').forEach(function (d) {
    const m = rutMail_(d.gmail);
    if (m && d.dias) dias[m] = d.dias;
  });

  const cola = [];
  rutGetAll_('alumnos?select=id,apellido,nombre,email,sheet_id,rutina_semana'
    + '&sheet_id=not.is.null').forEach(function (a) {
    const mail = rutMail_(a.email);
    const entreno = (mail && fue[mail]) ? Object.keys(fue[mail]).length : 0;
    if (!entreno) return;                    // no vino esta semana
    if (a.rutina_semana === semana) return;  // ya procesado

    const suyos = dias[mail] || 0;
    cola.push({
      id: a.id,
      quien: a.apellido + ', ' + a.nombre,
      sheet_id: a.sheet_id,
      entreno: entreno,
      dias: suyos,
      // Sin dias cargados no hay umbral que aplicar. Repetir es lo conservador:
      // nunca le saltea trabajo que no hizo.
      accion: !UMBRAL_ACTIVO || (suyos && entreno >= umbralAvance_(suyos))
        ? 'avanzar' : 'repetir',
      sinDias: !suyos,
    });
  });
  return cola;
}

/**
 * Avanza o repite la semana de todos los que entrenaron. Trigger: domingos 3am.
 *
 * Si se queda sin tiempo se reprograma sola a los 60 segundos y sigue donde
 * quedo, porque la cola se rearma mirando quien todavia no tiene la semana
 * nueva. El que falla queda anotado y no se reintenta en la misma corrida: sin
 * eso, un alumno con la planilla rota trabaria la cola para siempre.
 */
function rutinasSemanales() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;

  const t0 = Date.now();
  const props = PropertiesService.getScriptProperties();
  const runId = Utilities.getUuid();

  try {
    const f = rutFechasCorrida_();
    const semana = _ymd_(f.lunesProx);

    if (props.getProperty(PROP_RUT_SEMANA) !== semana) {
      props.setProperty(PROP_RUT_SEMANA, semana);
      props.deleteProperty(PROP_RUT_FALLADOS);
    }
    const fallados = JSON.parse(props.getProperty(PROP_RUT_FALLADOS) || '{}');

    const cola = colaRutinas_(f).filter(function (a) { return !fallados[a.id]; });
    let avanzados = 0, repetidos = 0, errores = 0, pendientes = 0;

    for (let i = 0; i < cola.length; i++) {
      if (Date.now() - t0 > RUTS.MAX_RUNTIME_MS) { pendientes = cola.length - i; break; }
      const a = cola[i];
      try {
        let r;
        if (a.accion === 'avanzar') {
          // Los RMs se leen antes de mover el bloque: despues la semana de test
          // ya no esta visible.
          realizarTareasPreActualizacion_(a.sheet_id);
          r = procesarYExtraerEntrenamiento_(a.sheet_id, f.lunesProx, false, f.lunesProx);
        } else {
          r = procesarYExtraerEntrenamiento_(a.sheet_id, f.lunesEsta, true, f.lunesProx);
        }
        if (r.rutinaStatus !== 'Actualizada') {
          throw new Error((r.entrenamientoInfo && r.entrenamientoInfo.error) || 'no se actualizo');
        }
        rutPatch_('alumnos?id=eq.' + a.id, {
          rutina_semana: semana,
          rutina_estado: null,
          rutina_leida_en: new Date().toISOString(),
        });
        if (a.accion === 'avanzar') avanzados++; else repetidos++;
      } catch (e) {
        errores++;
        fallados[a.id] = e.message;
        props.setProperty(PROP_RUT_FALLADOS, JSON.stringify(fallados));
        rutLog_(runId, 'error', 'rutinas: ' + e.message, { alumno: a.quien, accion: a.accion });
      }
    }

    rutBorrarSeguir_();
    if (pendientes) {
      ScriptApp.newTrigger('rutinasSemanalesSeguir').timeBased()
        .after(RUTS.RETRASO_TRIGGER_MS).create();
      Logger.log('rutinas -> avanzados: ' + avanzados + ', repetidos: ' + repetidos
        + ', errores: ' + errores + ', pendientes: ' + pendientes + '. Sigue en un minuto.');
      return;
    }

    // La corrida termino, asi que la semana forzada ya cumplio. Si quedara
    // puesta, el domingo que viene el trigger volveria a cerrar esta misma.
    props.deleteProperty(PROP_RUT_FORZADA);

    const fallaron = Object.keys(fallados).length;
    Logger.log('================ RUTINAS DE LA SEMANA ' + semana + ' ================\n'
      + 'avanzados : ' + avanzados + '\nrepetidos : ' + repetidos
      + '\nfallaron  : ' + fallaron);
    rutLog_(runId, fallaron ? 'warn' : 'info', 'rutinas semanales ok',
      { semana: semana, avanzados: avanzados, repetidos: repetidos, fallaron: fallaron,
        umbral: UMBRAL_ACTIVO });
    if (fallaron) {
      MailApp.sendEmail('diegojp2005@gmail.com', 'ZAC rutinas - ' + fallaron + ' fallaron',
        Object.keys(fallados).map(function (id) { return id + ': ' + fallados[id]; }).join('\n'));
    }
  } catch (e) {
    Logger.log('ERROR en rutinasSemanales: ' + e.message + '\n' + e.stack);
    rutLog_(runId, 'error', 'rutinas semanales: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

/** La continuacion. Handler aparte para poder borrarla sin tocar el semanal. */
function rutinasSemanalesSeguir() {
  rutinasSemanales();
}

function rutBorrarSeguir_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rutinasSemanalesSeguir') ScriptApp.deleteTrigger(t);
  });
}

/**
 * Que haria la corrida semanal, sin tocar ninguna planilla.
 *
 * Sin argumento usa las fechas de la corrida que toca —hoy, o la semana
 * forzada si hay una puesta—. `verSemanaPerdida` le pasa las de la semana que
 * quedo sin cerrar.
 */
function verRutinasSemanales(f) {
  f = f || rutFechasCorrida_();
  const cola = colaRutinas_(f);
  const avanzan = cola.filter(function (a) { return a.accion === 'avanzar'; });
  const repiten = cola.filter(function (a) { return a.accion === 'repetir'; });
  const sinDias = cola.filter(function (a) { return a.sinDias; });

  Logger.log(['RUTINAS — ensayo, no se escribe nada',
    'semana que se cierra : ' + _ymd_(f.lunesEsta),
    'semana que se abre   : ' + _ymd_(f.lunesProx),
    'umbral               : ' + (UMBRAL_ACTIVO
      ? 'activo, la mitad de los dias' : 'INACTIVO, avanzan todos'),
    '',
    'en la cola : ' + cola.length,
    '  avanzan  : ' + avanzan.length,
    '  repiten  : ' + repiten.length + '   (de esos, ' + sinDias.length + ' sin dias cargados)',
    '',
    cola.slice(0, 40).map(function (a) {
      return '  ' + _pad_(a.accion.toUpperCase(), 9) + _pad_(a.quien, 34)
        + 'entreno ' + a.entreno + ' de ' + (a.dias || '?') + ' dias'
        + (a.sinDias ? '   SIN DIAS CARGADOS'
          : (UMBRAL_ACTIVO ? '   umbral ' + umbralAvance_(a.dias) : ''));
    }).join('\n'),
    cola.length > 40 ? '  ... y ' + (cola.length - 40) + ' mas' : '',
  ].join('\n'));
}

/**
 * Ensayo de la recuperacion: que haria `correrSemanaPerdida`, sin escribir.
 *
 * Correr esto ANTES. La cola sale de los check-ins de esa semana, que ya
 * pasaron y no cambian, asi que lo que imprime es exactamente lo que va a
 * hacer.
 */
function verSemanaPerdida() {
  const f = rutFechasDe_(rutLunes_(SEMANA_PERDIDA));
  Logger.log('SEMANA PERDIDA: cierra ' + _ymd_(f.lunesEsta)
    + ', abre ' + _ymd_(f.lunesProx) + '\n');
  verRutinasSemanales(f);
}

/**
 * Cierra la semana que el trigger no corrio, con los check-ins de esa semana.
 *
 * Hace falta porque `rutFechas_` mira el reloj: corriendo `rutinasSemanales` un
 * lunes, la semana que cierra es la que recien empieza —sin check-ins— y la que
 * abre es la de dentro de siete dias, salteandose una. Poniendo el lunes en
 * `SEMANA_PERDIDA` la corrida usa las fechas de aquella semana y queda igual
 * que si hubiera corrido el domingo.
 *
 * La property se borra sola cuando la corrida termina.
 *
 * ESCRIBE en las planillas de los alumnos. Correr `verSemanaPerdida` primero.
 */
function correrSemanaPerdida() {
  const f = rutFechasDe_(rutLunes_(SEMANA_PERDIDA));
  PropertiesService.getScriptProperties().setProperty(PROP_RUT_FORZADA, SEMANA_PERDIDA);
  Logger.log('Semana forzada: cierra ' + _ymd_(f.lunesEsta)
    + ', abre ' + _ymd_(f.lunesProx));
  rutinasSemanales();
}

/**
 * Deja el trigger semanal de los domingos a las 3. Idempotente.
 *
 * `instalarTodo()` de Pipelines.gs ya lo instala —`rutinasSemanales` esta en su
 * lista `TRIGGERS`—, asi que esto es para reponerlo solo, sin tocar los demas.
 * Si se cambia la hora hay que cambiarla en los dos lados.
 */
function instalarRutinasSemanales() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rutinasSemanales') ScriptApp.deleteTrigger(t);
  });
  rutBorrarSeguir_();
  ScriptApp.newTrigger('rutinasSemanales').timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  Logger.log('Trigger instalado: rutinasSemanales, domingos a las 3 (huso del PROYECTO).');
}

/** Borra el estado a medias, para volver a empezar la corrida de la semana. */
function reiniciarRutinasSemanales() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_RUT_SEMANA);
  props.deleteProperty(PROP_RUT_FALLADOS);
  props.deleteProperty(PROP_RUT_FORZADA);
  rutBorrarSeguir_();
  Logger.log('Estado borrado. Ojo: los que ya tienen la semana nueva no vuelven a entrar.');
}
