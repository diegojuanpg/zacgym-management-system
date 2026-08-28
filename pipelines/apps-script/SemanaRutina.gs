/**
 * Que semana de entrenamiento tiene abierta cada alumno en su planilla.
 *
 * Va a la misma hoja que usa el script de rutinas —`Entrenamiento` con el
 * numero mas alto— y lee la fecha del bloque visible. Escribe el resultado en
 * `alumnos.rutina_semana`, que es lo que muestra la columna Entrenamiento del
 * listado.
 *
 * Es distinto de `alumnos_tracking.ultima_rutina_semana`: esa es la semana que
 * el pipeline de rutinas FIJO al avanzar, esta es la que la planilla tiene
 * abierta de verdad. Tenerlas separadas es lo que deja ver cuando se separaron.
 *
 * No abre las planillas con SpreadsheetApp: abrir un archivo cuesta segundos y
 * son cientos. Usa la API de Sheets pidiendo solo los rangos que hacen falta, de
 * a diez en paralelo con `fetchAll`.
 *
 * Es autonomo: no depende de Code.gs ni de SheetIds.gs.
 */

const SEM = {
  SUPA_URL: 'https://lrjqasglgmcxntuwamow.supabase.co',
  API: 'https://sheets.googleapis.com/v4/spreadsheets/',
  // Entran los que entrenaron en el ultimo mes y los que tienen la cuota al dia.
  DIAS_ACTIVIDAD: 30,
  EN_PARALELO: 10,
  ESPERA_MS: 1500,      // entre tandas, para no comerse un 429
  REINTENTOS: 3,
  MAX_RUNTIME_MS: 4.5 * 60 * 1000,
  RETRASO_TRIGGER_MS: 60 * 1000,
  HORA_TRIGGER: 4,      // despues de runDaily
  // Donde vive la grilla. Se verifica contra la columna A antes de creerle.
  FILA_FECHAS: 7,
  FILA_ENCABEZADOS: 10,
};

const PROP_SEM_PENDIENTES = 'SEMANA_PENDIENTES';
const PROP_SEM_RESUMEN = 'SEMANA_RESUMEN';
const PROP_SEM_SECRET = 'SHEETIDS_SUPABASE_SECRET';

/** Dos bloques visibles a la vez: la planilla quedo a medio actualizar. */
const SEM_REVISAR = 'Revisar';

function semHeaders_() {
  const props = PropertiesService.getScriptProperties();
  const secret = (props.getProperty(PROP_SEM_SECRET)
    || props.getProperty('DEST_SUPABASE_SECRET') || '').replace(/\s+/g, '');
  if (!secret || secret.indexOf('eyJ') !== 0) {
    throw new Error('Falta la secret legacy service_role. Corre setSecretsSheetIds una vez.');
  }
  return { apikey: secret, authorization: 'Bearer ' + secret };
}

function semGet_(pathQuery) {
  const res = UrlFetchApp.fetch(SEM.SUPA_URL + '/rest/v1/' + pathQuery,
    { headers: semHeaders_(), muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase GET ' + pathQuery + ': ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

function semPatch_(id, cambios) {
  const res = UrlFetchApp.fetch(SEM.SUPA_URL + '/rest/v1/alumnos?id=eq.' + id, {
    method: 'patch',
    contentType: 'application/json',
    headers: Object.assign(semHeaders_(), { Prefer: 'return=minimal' }),
    payload: JSON.stringify(cambios),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase PATCH: ' + res.getContentText());
  }
}

function semLog_(runId, nivel, mensaje, contexto) {
  try {
    UrlFetchApp.fetch(SEM.SUPA_URL + '/rest/v1/pipeline_logs', {
      method: 'post',
      contentType: 'application/json',
      headers: Object.assign(semHeaders_(), { Prefer: 'return=minimal' }),
      payload: JSON.stringify([{
        run_id: runId, pipeline: 'semanaRutina', nivel: nivel,
        mensaje: mensaje, contexto: contexto || null,
      }]),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('No se pudo loguear: ' + e);
  }
}

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
  return semGet_(q);
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
  props.setProperty(PROP_SEM_RESUMEN, '{"leidos":0,"revisar":0,"sinFecha":0,"errores":0}');
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

/** Pide de a diez en paralelo, con reintentos: la API de Sheets tira 429 facil. */
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
      || '{"leidos":0,"revisar":0,"sinFecha":0,"errores":0}');

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

      // Vuelta 1: que hojas tiene cada planilla, para quedarse con la
      // Entrenamiento de numero mas alto.
      const hojas = semTraer_(lote.map(function (a) {
        return { url: SEM.API + a.sheet + '?fields=sheets(properties(title))',
                 headers: cab, muteHttpExceptions: true };
      }));

      const conHoja = [];
      hojas.forEach(function (res, i) {
        const a = lote[i];
        if (res.getResponseCode() !== 200) {
          r.errores++;
          semPatch_(a.id, { rutina_semana: null, rutina_estado: 'no se pudo abrir la planilla',
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
          semPatch_(a.id, { rutina_semana: null, rutina_estado: 'sin hoja Entrenamiento',
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
          semPatch_(x.a.id, {
            rutina_semana: leido.fecha || null,
            rutina_estado: leido.fecha ? null : leido.estado,
            rutina_leida_en: new Date().toISOString(),
          });
        } catch (e) {
          r.errores++;
          semLog_(runId, 'error', 'No se pudo guardar: ' + e.message, { alumno: x.a.quien });
        }
      });
    }

    if (pendientes.length) {
      props.setProperty(PROP_SEM_PENDIENTES, JSON.stringify(pendientes));
      props.setProperty(PROP_SEM_RESUMEN, JSON.stringify(r));
      semBorrarTriggers_('semanaRutina');
      ScriptApp.newTrigger('semanaRutina').timeBased().after(SEM.RETRASO_TRIGGER_MS).create();
      Logger.log('semanaRutina: quedan ' + pendientes.length + '. ' + JSON.stringify(r));
      return;
    }

    props.deleteProperty(PROP_SEM_PENDIENTES);
    props.deleteProperty(PROP_SEM_RESUMEN);
    semBorrarTriggers_('semanaRutina');
    semLog_(runId, 'info', 'Listo', r);
    Logger.log('semanaRutina: ' + JSON.stringify(r));
  } catch (e) {
    semLog_(runId, 'error', e.message, null);
    Logger.log('ERROR en semanaRutina: ' + e.message + ' ' + e.stack);
  } finally {
    lock.releaseLock();
  }
}

function semBorrarTriggers_(nombre) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === nombre) ScriptApp.deleteTrigger(t);
  });
}

/** Correr UNA vez. Deja la lectura diaria a las 04:00, despues de runDaily. */
function instalarTriggerSemanaRutina() {
  semBorrarTriggers_('semanaRutina');
  ScriptApp.newTrigger('semanaRutina').timeBased().everyDays(1).atHour(SEM.HORA_TRIGGER).create();
  Logger.log('Trigger diario de semanaRutina instalado a las ' + SEM.HORA_TRIGGER + ':00.');
}

/** Borra la lista de pendientes para volver a empezar de cero. */
function reiniciarSemanaRutina() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_SEM_PENDIENTES);
  props.deleteProperty(PROP_SEM_RESUMEN);
  semBorrarTriggers_('semanaRutina');
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

  const alumnos = semGet_('alumnos?select=id,apellido,nombre,sheet_id&sheet_id=not.is.null'
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
