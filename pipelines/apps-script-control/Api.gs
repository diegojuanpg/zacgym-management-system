/**
 * ZAC GYM — endpoint HTTP para el mostrador.
 *
 * Es la unica puerta de entrada desde la app: un Web App con `doPost` que
 * recibe un lote de alumnos y hace sobre sus planillas lo que el mostrador
 * pidio. Dos acciones:
 *
 *   rutinas  deja visible el bloque fechado al lunes que se indique.
 *   acceso   comparte o descomparte la planilla con el alumno.
 *
 * El motor no se duplica: `rutinas` llama al mismo
 * `procesarYExtraerEntrenamiento_` que la corrida de los domingos, y `acceso`
 * al mismo `compartirArchivo_` / `descompartirArchivo_` de ShareRutinas.gs.
 * Todo eso vive en este proyecto, asi que Api.gs solo valida, ordena y
 * responde.
 *
 * QUE MANDA LA APP
 *
 *   POST <url del web app>
 *   { "secret": "...", "accion": "rutinas", "semana": "actual" | "proxima",
 *     "alumnos": ["<uuid>", ...] }
 *
 * Un pedido lleva una sola semana. Si en el mostrador hay alumnos con semanas
 * distintas, la app manda un pedido por semana.
 *
 *   { "secret": "...", "accion": "acceso", "compartir": true | false,
 *     "alumnos": ["<uuid>", ...] }
 *
 * QUE DEVUELVE
 *
 *   { "ok": true, "resultados": [{ "id", "quien", "ok", "detalle"|"error" }] }
 *   { "ok": false, "error": "..." }
 *
 * Siempre HTTP 200: Apps Script no deja elegir el codigo, asi que el estado
 * real esta en `ok`. La app lo lee de ahi.
 *
 * DE QUE DEPENDE
 *
 * Los tres archivos tienen que estar en el mismo proyecto de Apps Script:
 * Rutinas.gs por el motor de rutinas, ShareRutinas.gs por el de Drive, y
 * Pipelines.gs por la secret de Supabase, que es una Script Property del
 * proyecto. Falta uno y el endpoint contesta que falta.
 *
 * PUESTA EN MARCHA
 *
 *   1. `crearSecretApi()` una vez. Imprime el secret: va en la variable
 *      APPS_SCRIPT_SECRET de Vercel y de `.env.local`.
 *   2. Implementar > Nueva implementacion > Aplicacion web.
 *      Ejecutar como: yo. Quien tiene acceso: cualquier usuario.
 *      "Cualquier usuario" es obligatorio para que la app pueda pegarle sin
 *      una cuenta de Google; lo que la protege es el secret.
 *   3. La URL `/exec` que queda va en APPS_SCRIPT_URL.
 *
 * OJO: cada vez que se pega codigo nuevo hay que crear una implementacion
 * nueva (o "Administrar implementaciones" > editar > version: nueva). Si no,
 * la URL sigue sirviendo la version vieja.
 */

const API = {
  /** Tope de alumnos por pedido. La app manda de a cinco, en tandas. */
  MAX_LOTE: 10,
  /**
   * Corta y contesta lo que alcanzo a hacer.
   *
   * Son 45 segundos y no los 6 minutos de Apps Script porque el que espera del
   * otro lado es Vercel, que corta la funcion al minuto. Contestando antes, el
   * que no llego a procesarse vuelve como un error suyo y se reintenta; si en
   * cambio corta Vercel, la respuesta se pierde entera aunque el trabajo se
   * haya hecho.
   */
  MAX_RUNTIME_MS: 45 * 1000,
  /** Nombre con el que se loguea en `pipeline_logs`. */
  PIPELINE: 'MostradorRutinas',
};

const PROP_API_SECRET = 'MOSTRADOR_API_SECRET';

// ============================================================
// ENTRADA
// ============================================================

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (_) {
    return apiSalida_({ ok: false, error: 'El cuerpo no es JSON valido.' });
  }

  if (!apiSecretOk_(body.secret)) {
    return apiSalida_({ ok: false, error: 'Secret invalido.' });
  }

  try {
    if (body.accion === 'rutinas') return apiSalida_(apiRutinas_(body));
    if (body.accion === 'acceso') return apiSalida_(apiAcceso_(body));
    return apiSalida_({ ok: false, error: 'Accion desconocida: ' + body.accion });
  } catch (err) {
    return apiSalida_({ ok: false, error: err.message });
  }
}

function apiSalida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Compara el secret sin cortar en la primera diferencia.
 *
 * Un `===` tarda distinto segun cuantos caracteres coincidan, y el endpoint es
 * publico: comparar entero cuesta lo mismo y no filtra nada.
 */
function apiSecretOk_(dado) {
  const esperado = PropertiesService.getScriptProperties().getProperty(PROP_API_SECRET) || '';
  const texto = String(dado || '');
  if (!esperado || texto.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) {
    dif |= texto.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return dif === 0;
}

/** Genera y guarda el secret del endpoint. Correr una vez, copiar lo que imprime. */
function crearSecretApi() {
  const props = PropertiesService.getScriptProperties();
  const ya = props.getProperty(PROP_API_SECRET);
  if (ya) {
    Logger.log('Ya hay uno guardado:\n' + ya
      + '\n\nPara rotarlo, correr `rotarSecretApi()`.');
    return;
  }
  const nuevo = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  props.setProperty(PROP_API_SECRET, nuevo);
  Logger.log('APPS_SCRIPT_SECRET=' + nuevo + '\n\nPegalo en Vercel y en .env.local.');
}

/** Reemplaza el secret. La app deja de andar hasta que se actualice la variable. */
function rotarSecretApi() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_API_SECRET);
  crearSecretApi();
}

// ============================================================
// LOTE — lo comun a las dos acciones
// ============================================================

/**
 * Los alumnos del lote, en el mismo orden que los pidio la app.
 *
 * Los datos salen de Supabase y no del cuerpo del pedido: el `sheet_id` y el
 * mail son lo que decide sobre que archivo se escribe, y eso no puede venir de
 * afuera. La app manda ids y nada mas.
 */
function apiLote_(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Falta la lista de alumnos.');
  }
  if (ids.length > API.MAX_LOTE) {
    throw new Error('Son ' + ids.length + ' alumnos y el maximo por lote es ' + API.MAX_LOTE + '.');
  }
  ids.forEach(function (id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error('Id de alumno invalido: ' + id);
    }
  });

  const filas = rutGet_('alumnos?select=id,apellido,nombre,email,sheet_id'
    + '&id=in.(' + ids.join(',') + ')');
  const porId = {};
  filas.forEach(function (a) { porId[a.id] = a; });

  return ids.map(function (id) {
    const a = porId[id];
    return a
      ? { id: id, quien: a.apellido + ', ' + a.nombre, email: a.email, sheet_id: a.sheet_id }
      : { id: id, quien: id, falta: true };
  });
}

/**
 * Recorre el lote llamando a `hacer` y arma la respuesta.
 *
 * Un alumno que falla no frena a los demas: cada uno trae su propio `ok`. Y si
 * se acaba el tiempo, los que quedan vuelven con ese error en vez de que Apps
 * Script corte la respuesta a la mitad.
 */
function apiRecorrer_(lote, runId, hacer) {
  const t0 = Date.now();
  const resultados = [];
  let hechos = 0;

  lote.forEach(function (a) {
    if (a.falta) {
      resultados.push({ id: a.id, quien: a.quien, ok: false, error: 'No esta en la base.' });
      return;
    }
    if (!a.sheet_id) {
      resultados.push({ id: a.id, quien: a.quien, ok: false, error: 'No tiene planilla cargada.' });
      return;
    }
    if (Date.now() - t0 > API.MAX_RUNTIME_MS) {
      resultados.push({ id: a.id, quien: a.quien, ok: false, error: 'Se acabo el tiempo, no llego a procesarse.' });
      return;
    }
    try {
      resultados.push({ id: a.id, quien: a.quien, ok: true, detalle: hacer(a) });
      hechos++;
    } catch (err) {
      resultados.push({ id: a.id, quien: a.quien, ok: false, error: err.message });
      rutLog_(runId, 'error', 'mostrador: ' + err.message, { alumno: a.quien }, API.PIPELINE);
    }
  });

  return { ok: true, resultados: resultados, hechos: hechos };
}

// ============================================================
// ACCION — rutinas
// ============================================================

/**
 * Deja visible el bloque fechado al lunes que se pidio.
 *
 * `semana` es cual: `actual` el lunes de esta semana, `proxima` el siguiente.
 *
 * Busca y muestra, nada mas. No reescribe la fecha del bloque ni toca los RMs:
 * los bloques ya vienen fechados en la planilla y lo unico que hace falta es
 * que quede a la vista el que corresponde. Es la diferencia con la corrida de
 * los domingos, que ademas repite semanas y levanta los RMs antes de mover.
 *
 * Por eso `esRepetirSemana` va en false: en true, `procesarYExtraerEntrenamiento_`
 * le pisa la fecha al bloque que encuentra.
 */
function apiRutinas_(body) {
  if (body.semana && body.semana !== 'proxima' && body.semana !== 'actual') {
    throw new Error('Semana invalida: ' + body.semana);
  }
  const f = rutFechas_();
  const destino = body.semana === 'proxima' ? f.lunesProx : f.lunesEsta;
  const semana = _ymd_(destino);
  const lote = apiLote_(body.alumnos);
  const runId = Utilities.getUuid();

  const salida = apiRecorrer_(lote, runId, function (a) {
    const r = procesarYExtraerEntrenamiento_(a.sheet_id, destino, false, destino);
    if (r.rutinaStatus !== 'Actualizada') {
      throw new Error((r.entrenamientoInfo && r.entrenamientoInfo.error) || 'No se actualizo.');
    }
    rutPatch_('alumnos?id=eq.' + a.id, {
      rutina_semana: semana,
      rutina_estado: null,
      rutina_leida_en: new Date().toISOString(),
    });
    return (r.entrenamientoInfo && r.entrenamientoInfo.bloque) || 'actualizada';
  });

  salida.semana = semana;
  rutLog_(runId, salida.hechos === lote.length ? 'info' : 'warn',
    'mostrador: rutinas ' + salida.hechos + '/' + lote.length,
    { semana: semana, pedidos: lote.length, hechos: salida.hechos }, API.PIPELINE);
  return salida;
}

// ============================================================
// ACCION — acceso a la planilla
// ============================================================

/**
 * Comparte o descomparte la planilla de cada alumno del lote.
 *
 * Compartir reusa `compartirArchivo_` de ShareRutinas.gs, que antes de dar el
 * acceso deja el archivo con `writersCanShare` en false y la descarga cortada
 * para editores y lectores: son las tres casillas destildadas de la pantalla
 * de configuracion de Drive. Si eso se cambia, se cambia alla y vale para las
 * dos vias.
 *
 * Nunca notifica por mail: el alumno ya sabe que le compartimos la rutina y el
 * mail automatico de Drive solo genera preguntas.
 */
function apiAcceso_(body) {
  // Sin ShareRutinas.gs en el proyecto esto explota con un
  // "keepSet_ is not defined" que no le dice nada a nadie.
  if (typeof compartirArchivo_ !== 'function' || typeof keepSet_ !== 'function') {
    throw new Error('Falta ShareRutinas.gs en el proyecto de Apps Script: ahi viven '
      + 'compartirArchivo_, descompartirArchivo_ y keepSet_.');
  }
  if (typeof body.compartir !== 'boolean') {
    throw new Error('Falta decir si es compartir o descompartir.');
  }
  const lote = apiLote_(body.alumnos);
  const runId = Utilities.getUuid();
  const keep = keepSet_();

  const salida = apiRecorrer_(lote, runId, function (a) {
    if (!body.compartir) {
      const q = descompartirArchivo_(a.sheet_id, keep);
      return q === 1 ? '1 acceso quitado' : q + ' accesos quitados';
    }
    const email = String(a.email || '').trim().toLowerCase();
    if (!email) throw new Error('No tiene mail cargado en la ficha.');
    compartirArchivo_(a.sheet_id, email, false);
    return 'compartida con ' + email;
  });

  rutLog_(runId, salida.hechos === lote.length ? 'info' : 'warn',
    'mostrador: ' + (body.compartir ? 'compartir ' : 'descompartir ')
      + salida.hechos + '/' + lote.length,
    { pedidos: lote.length, hechos: salida.hechos }, API.PIPELINE);
  return salida;
}
