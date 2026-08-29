/**
 * Comparador: la logica vieja contra la nueva, sobre la misma planilla.
 *
 * Corre una, mide, deshace, corre la otra, mide, deshace. La planilla queda
 * exactamente como estaba: se anota que bloque estaba visible al empezar y se
 * restaura despues de cada pasada.
 *
 * NO toca Prog1 ni Avances. La carga de RMs escribe en esas hojas y deshacerlo
 * seria adivinar, asi que se mide solo la DETECCION —averiguar si la semana que
 * se cierra es de test—, que es la parte que cambio. Las escrituras son
 * identicas en las dos versiones.
 *
 * Va en el mismo proyecto que Rutinas.gs: le usa las constantes y los helpers.
 * Es descartable, se puede borrar despues de medir.
 *
 * Poner el apellido en APELLIDO (el de Rutinas.gs) y correr `comparar`.
 */

function comparar() {
  const a = rutBuscarAlumno_(APELLIDO);
  if (!a) return;

  const ss = SpreadsheetApp.openById(a.sheet_id);
  const hoja = encontrarHojaEntrenamiento_(ss);
  if (!hoja) { Logger.log('No se encontro la hoja de entrenamiento.'); return; }

  const colA = hoja.getRange(1, 1, Math.min(hoja.getLastRow(), 30), 1).getValues();
  const clave = encontrarFilasClave_(colA);
  if (!clave) { Logger.log("No se encontro 'DIA' en la columna A."); return; }

  // El estado inicial, para poder volver. Se guarda la fecha del bloque visible
  // y no el numero de columna: restaurar es "mostrar el bloque de esa fecha",
  // que es exactamente lo que sabe hacer procesarYExtraerEntrenamiento_.
  const original = cmpFechaVisible_(hoja, clave);
  if (!original) {
    Logger.log('No pude determinar que bloque esta visible. Aborto para no dejarla mal.');
    return;
  }
  const f = rutFechas_();
  Logger.log('Alumno   : ' + a.apellido + ', ' + a.nombre
    + '\nVisible  : ' + _ymd_(original)
    + '\nAvanzara : ' + _ymd_(f.lunesProx) + '\n');

  const filas = [];

  // ---------- mover el bloque ----------
  let t = Date.now();
  const rv = cmpViejoProcesar_(a.sheet_id, f.lunesProx, false, f.lunesProx);
  const tViejo = Date.now() - t;
  cmpRestaurar_(a.sheet_id, original);

  t = Date.now();
  const rn = procesarYExtraerEntrenamiento_(a.sheet_id, f.lunesProx, false, f.lunesProx);
  const tNuevo = Date.now() - t;
  cmpRestaurar_(a.sheet_id, original);

  filas.push(['mover el bloque', tViejo, tNuevo,
    rv.rutinaStatus + ' / ' + rn.rutinaStatus]);

  // ---------- detectar si la semana es de test ----------
  t = Date.now();
  cmpViejoDetectar_(hoja, clave);
  const dViejo = Date.now() - t;

  t = Date.now();
  rutBloqueVisibleRapido_(a.sheet_id, hoja.getName(), clave.headerRow);
  const dNuevo = Date.now() - t;

  filas.push(['detectar semana de test', dViejo, dNuevo, '']);

  // ---------- informe ----------
  const linea = function (n, v, x) {
    const mejora = v > 0 ? ((v - x) / v * 100) : 0;
    return '  ' + _pad_(n, 26)
      + _pad_((v / 1000).toFixed(2) + 's', 10)
      + _pad_((x / 1000).toFixed(2) + 's', 10)
      + (mejora >= 0 ? '-' : '+') + Math.abs(mejora).toFixed(0) + '%';
  };
  const totV = filas.reduce(function (s, r) { return s + r[1]; }, 0);
  const totN = filas.reduce(function (s, r) { return s + r[2]; }, 0);

  Logger.log([
    '================ COMPARACION ================',
    '  ' + _pad_('', 26) + _pad_('VIEJO', 10) + _pad_('NUEVO', 10) + 'cambio',
    filas.map(function (r) { return linea(r[0], r[1], r[2]); }).join('\n'),
    '  ' + '-'.repeat(52),
    linea('TOTAL', totV, totN),
    '',
    '  veces mas rapido: ' + (totN > 0 ? (totV / totN).toFixed(1) : '?') + 'x',
    '',
    '  estados: ' + filas[0][3],
    '  La planilla quedo como estaba (bloque ' + _ymd_(original) + ').',
  ].join('\n'));
}

/** Rellena a la derecha, para que las columnas del informe queden alineadas. */
function _pad_(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

/** La fecha del bloque visible ahora mismo. Es lo que hace falta para volver. */
function cmpFechaVisible_(hoja, clave) {
  const lastCol = hoja.getLastColumn();
  const dos = hoja.getRange(clave.dateRow, 1, 4, lastCol).getValues();
  const fechas = dos[0];
  const headers = dos[3];
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').toUpperCase();
    if (h !== 'SERIES' && h !== 'PESO') continue;
    if (hoja.isColumnHiddenByUser(i + 1)) continue;
    if (fechas[i] instanceof Date) return fechas[i];
  }
  return null;
}

/** Vuelve a dejar visible el bloque de esa fecha, con la implementacion nueva. */
function cmpRestaurar_(sheetId, fecha) {
  const r = procesarYExtraerEntrenamiento_(sheetId, fecha, false, fecha);
  if (r.rutinaStatus !== 'Actualizada') {
    Logger.log('OJO: no pude restaurar el bloque ' + _ymd_(fecha) + ': ' + r.entrenamientoInfo.error);
  }
}

// ============================================================
// LA LOGICA VIEJA, tal cual estaba en el commit 5867388
// ============================================================

/** Lo que hacia antes para saber si la semana era de test: leer todo y recorrer. */
function cmpViejoDetectar_(hoja, claveIgnorada) {
  const datos = hoja.getDataRange().getValues();
  const filasClave = encontrarFilasClave_(datos);
  if (!filasClave) return null;
  return analizarEstructuraDeBloques_(hoja, filasClave.headerRow);
}

/**
 * El corazon: deja visible el bloque de `fechaABuscar` y oculta el resto.
 *
 * `esRepetirSemana` reescribe la fecha del bloque encontrado con `fechaElegida`:
 * asi el alumno repite el mismo trabajo, pero fechado a la semana que viene.
 */
function cmpViejoProcesar_(userId, fechaABuscar, esRepetirSemana, fechaElegida) {
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
      entrenamientoInfo: cmpExtraerDatos_(hoja.getDataRange().getValues(), analisis, filasClave),
    };
  } catch (e) {
    return { rutinaStatus: 'Fallo total', entrenamientoInfo: { error: e.message } };
  }
}

function cmpExtraerTitulo_(datos, analisis, fila) {
  for (let i = analisis.visibleIndex; i >= 0; i--) {
    const t = datos[fila][analisis.todos[i].index];
    if (t) return t;
  }
  return 'Sin Titulo';
}

function cmpExtraerFecha_(datos, infoBloque, filaHeader, filaFecha) {
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

function cmpExtraerDatos_(datos, analisis, filasClave) {
  const titulo = cmpExtraerTitulo_(datos, analisis, filasClave.blockTitleRow - 1);
  const f = cmpExtraerFecha_(datos, analisis.visible, filasClave.headerRow - 1, filasClave.dateRow - 1);
  const semana = f.columna !== -1 ? (datos[filasClave.weekRow - 1][f.columna] || '') : '';
  return { bloque: titulo, fecha: f.fecha, semana: semana };
}