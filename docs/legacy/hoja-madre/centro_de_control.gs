const HOJA_CONTROL = "Control de usuarios";
const CARPETA_ARCHIVADOS = "Usuarios archivados";
const TIEMPO_MAX_EJECUCION = 4.5 * 60 * 1000;
const RETRASO_TRIGGER = 2 * 60 * 1000;
const COLUMNA_ESTADO_ACTIVIDAD = 'P';
const COLUMNA_ESTADO_PLANIFICACION = 'Q';
const ID_HOJA_SECUNDARIA = "1xdIN5PlzEf29TkZdEPv0vMDMkePX10wjhE5DNdPLc-A";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Funciones')
    .addItem('1. Actualizar listado de alumnos', 'iniciarCreacionListado')
    .addItem('2. Extraer información de actividad', 'iniciarExtraccionActividad')
    .addItem('3. Actualizar rutinas', 'iniciarGestionEntrenamiento')
    .addItem('4. Actualizar pagos', 'iniciarActualizacionGeneral')
    .addSeparator()
    .addItem('Panel de acciones', 'abrirPanelDeAcciones')
    .addItem('Añadir alumno al listado', 'AñadirAlumnoAlListado')
    .addItem('Crear rutina', 'CrearArchivo')
    .addToUi();
}

function abrirPanelDeAcciones() {
  const html = HtmlService.createHtmlOutputFromFile('PanelAcciones')
    .setTitle('Panel de Acciones')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

function obtenerAlumnosConId() {
  try {
    const hojaControl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONTROL);
    const filaEncabezados = _encontrarFilaEncabezados(hojaControl);
    const rangoDatos = hojaControl.getRange(filaEncabezados + 1, 1, hojaControl.getLastRow() - filaEncabezados, 2).getValues();
    return rangoDatos
      .filter(fila => fila[0] && fila[1])
      .map(fila => ({ id: fila[0], nombre: fila[1] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  } catch (e) {
    Logger.log(`Error en obtenerAlumnosConId: ${e.message}`);
    return [];
  }
}

function procesarAccionPanel(datos) {
  const { alumnoId, accion } = datos;
  try {
    switch (accion) {
      case 'actualizar_rutina':
        return ejecutarActualizacionIndividual_(alumnoId, 0);
      case 'volver_1_semana':
        return ejecutarActualizacionIndividual_(alumnoId, 1);
      case 'volver_2_semanas':
        return ejecutarActualizacionIndividual_(alumnoId, 2);
      case 'volver_3_semanas':
        return ejecutarActualizacionIndividual_(alumnoId, 3);
      case 'ausencia_larga':
        return ejecutarProtocoloAusencia_(alumnoId);
      case 'crear_boton':
        const exitoBoton = aplicarFormatoBoton(alumnoId);
        return exitoBoton ? "Botón creado o actualizado exitosamente." : "Falló la creación del botón. Revisa los registros.";
      case 'cargar_rms':
        return ejecutarCargaRMsIndividual_(alumnoId);
      default:
        return "Acción no reconocida.";
    }
  } catch (e) {
    Logger.log(`ERROR FATAL en procesarAccionPanel para ID ${alumnoId}, Acción ${accion}: ${e.message} ${e.stack}`);
    return `Error: ${e.message}`;
  }
}

function ejecutarActualizacionIndividual_(alumnoId, semanasAtras) {
  const lunesSemanaActual = calcularFechaObjetivo_("Semana actual");
  let fechaABuscar;
  if (semanasAtras === 0) {
    fechaABuscar = new Date(lunesSemanaActual);
  } else {
    fechaABuscar = new Date(lunesSemanaActual.getTime() - (semanasAtras * 7 * 24 * 60 * 60 * 1000));
  }
  const esRepetir = semanasAtras > 0;
  const resultado = procesarYExtraerEntrenamiento_(alumnoId, fechaABuscar, esRepetir, lunesSemanaActual);
  if (resultado.rutinaStatus === "Actualizada") {
    try {
      const hojaControl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONTROL);
      const headerRow = _encontrarFilaEncabezados(hojaControl);
      const cols = _obtenerMapaDeColumnas(hojaControl, headerRow);
      const ids = hojaControl.getRange(headerRow + 1, 1, hojaControl.getLastRow() - headerRow, 1).getValues().flat();
      const rowIndex = ids.findIndex(id => id === alumnoId);
      if (rowIndex !== -1) {
        const rowToUpdate = headerRow + 1 + rowIndex;
        const colFecha = cols['fecha'];
        const colSemana = cols['semana'];
        const colBloque = cols['bloque'];
        if (colFecha !== undefined) hojaControl.getRange(rowToUpdate, colFecha + 1).setValue(resultado.entrenamientoInfo.fecha);
        if (colSemana !== undefined) hojaControl.getRange(rowToUpdate, colSemana + 1).setValue(resultado.entrenamientoInfo.semana);
        if (colBloque !== undefined) hojaControl.getRange(rowToUpdate, colBloque + 1).setValue(resultado.entrenamientoInfo.bloque);
      }
    } catch(e) {
      Logger.log(`Error al intentar actualizar la información en 'Control de usuarios': ${e.message}`);
    }
    return `Rutina actualizada exitosamente al bloque: "${resultado.entrenamientoInfo.bloque}".`;
  } else {
    return `Error al actualizar: ${resultado.entrenamientoInfo.error}`;
  }
}

function ejecutarProtocoloAusencia_(alumnoId) {
  const ss = SpreadsheetApp.openById(alumnoId);
  const hojaEntrenamientoOriginal = encontrarHojaEntrenamiento_(ss);
  if (!hojaEntrenamientoOriginal) return "No se encontró la hoja de entrenamiento principal del alumno.";
  let nuevoNombre = "Temporal";
  let contador = 1;
  while (ss.getSheetByName(nuevoNombre)) {
    nuevoNombre = `Temporal${contador++}`;
  }
  const hojaTemporal = hojaEntrenamientoOriginal.copyTo(ss).setName(nuevoNombre);
  ss.setActiveSheet(hojaTemporal);
  const todasLasHojas = ss.getSheets();
  for (const hoja of todasLasHojas) {
    if (hoja.getName().toLowerCase().startsWith('entrenamiento')) {
      hoja.hideSheet();
    }
  }
  return `Se creó la hoja "${nuevoNombre}" y se ocultaron las hojas de entrenamiento originales.`;
}

function ejecutarCargaRMsIndividual_(alumnoId) {
  const ss = SpreadsheetApp.openById(alumnoId);
  const hojaEntrenamiento = encontrarHojaEntrenamiento_(ss);
  const hojaProg1 = ss.getSheetByName("Prog1");
  if (!hojaEntrenamiento || !hojaProg1) return "El archivo del alumno no contiene las hojas 'Entrenamiento' o 'Prog1'.";
  const datosCompletos = hojaEntrenamiento.getDataRange().getValues();
  const filasClave = encontrarFilasClave_(datosCompletos);
  if (!filasClave) return "La estructura de la hoja no es válida.";
  const analisisGeneral = analizarEstructuraDeBloques_(hojaEntrenamiento, filasClave.headerRow);
  if (analisisGeneral.error) return `Error analizando la hoja: ${analisisGeneral.error}`;
  let bloqueRMEncontrado = null;
  for (let i = analisisGeneral.visibleIndex; i >= 0; i--) {
    const bloqueActual = analisisGeneral.todos[i];
    const textoCelda1 = (datosCompletos[filasClave.headerRow - 2][bloqueActual.index] || '').toString().trim().toUpperCase();
    const textoCelda2 = (datosCompletos[filasClave.headerRow - 3][bloqueActual.index] || '').toString().trim().toUpperCase();
    if (textoCelda1 === "TEST RM" || textoCelda2 === "TEST RM" || textoCelda2 === "AL MÁXIMO (RM)") {
      const endCol = (i + 1 < analisisGeneral.todos.length) ? analisisGeneral.todos[i + 1].index - 1 : hojaEntrenamiento.getLastColumn() - 1;
      bloqueRMEncontrado = { visible: { startCol: bloqueActual.index, endCol: endCol } };
      break;
    }
  }
  if (!bloqueRMEncontrado) return "No se encontró una semana de 'TEST RM' o 'AL MÁXIMO (RM)' reciente.";
  cargarRMs_(hojaEntrenamiento, hojaProg1, datosCompletos, filasClave, bloqueRMEncontrado);
  return "Carga de RMs ejecutada exitosamente.";
}

function CrearArchivo() {
  const html = HtmlService.createHtmlOutputFromFile('FormularioArchivo')
    .setTitle('Creación de Archivos');
  SpreadsheetApp.getUi().showSidebar(html);
}

function obtenerListaDeAlumnos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaSettings = ss.getSheetByName("Settings");
    if (!hojaSettings) return [];
    return hojaSettings.getRange("B2:B").getValues().flat().filter(String);
  } catch (e) {
    Logger.log(`Error en obtenerListaDeAlumnos: ${e.message}`);
    return [];
  }
}

function obtenerListaDeProgramas() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaSettings = ss.getSheetByName("Settings");
    if (!hojaSettings) return [];
    const rango = hojaSettings.getRange("D2:E" + hojaSettings.getLastRow()).getValues();
    return rango.map(fila => {
      if (fila[0] && fila[1]) return { nombre: fila[0], id: fila[1] };
    }).filter(Boolean);
  } catch (e) {
    Logger.log(`Error en obtenerListaDeProgramas: ${e.message}`);
    return [];
  }
}

function procesarCreacionArchivo(datosFormulario) {
  const ui = SpreadsheetApp.getUi();
  const { alumno: nombreAlumno, programaId, fechaInicio } = datosFormulario;
  try {
    const ID_CARPETA_DESTINO = '1nDfQOYrY_Hdg_VJu5_vXyS_RPV3jxU4k';
    const carpetaDestino = DriveApp.getFolderById(ID_CARPETA_DESTINO);
    const archivoPlantilla = DriveApp.getFileById(programaId);
    const nuevoNombre = `${nombreAlumno} - Rutina`;
    const copiaArchivo = archivoPlantilla.makeCopy(nuevoNombre, carpetaDestino);
    const nuevoSpreadsheet = SpreadsheetApp.openById(copiaArchivo.getId());
    const hojaEntrenamiento = nuevoSpreadsheet.getSheetByName("Entrenamiento");
    if (!hojaEntrenamiento) throw new Error('No se encontró la hoja "Entrenamiento".');
    hojaEntrenamiento.getRange("B3").setValue(nombreAlumno);
    hojaEntrenamiento.getRange("B4").setValue(new Date(fechaInicio));
    const nuevoArchivoUrl = copiaArchivo.getUrl();
    const htmlOutput = HtmlService.createHtmlOutput(
      `<style> body {font-family: Arial, sans-serif; text-align: center;} a {font-size: 14px;} </style>` +
      `<p>¡Archivo creado con éxito!</p><p>Haz clic abajo para abrirlo:</p>` +
      `<a href="${nuevoArchivoUrl}" target="_blank" onclick="google.script.host.close()">${nuevoNombre}</a>`
    ).setWidth(400).setHeight(150);
    ui.showModalDialog(htmlOutput, 'Archivo Creado');
  } catch (e) {
    Logger.log(`ERROR en procesarCreacionArchivo: ${e.message} ${e.stack}`);
    ui.alert('Error', `Ocurrió un error: ${e.message}`, ui.ButtonSet.OK);
  }
}

function AñadirAlumnoAlListado() {
  const html = HtmlService.createHtmlOutputFromFile('FormularioAlumno')
    .setWidth(400)
    .setHeight(250);
  SpreadsheetApp.getUi().showModalDialog(html, 'Ingresar Datos del Alumno');
}

function procesarNuevoAlumno(datosFormulario) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const { apellido, nombre } = datosFormulario;
  const nombreCompleto = `${capitalizarPalabras_(apellido.trim())}, ${capitalizarPalabras_(nombre.trim())}`;
  const nombreNormalizado = normalizarTexto_(nombreCompleto);
  try {
    const hojaDestino = ss.getSheetByName("Control de usuarios");
    if (!hojaDestino) throw new Error('La hoja "Control de usuarios" no fue encontrada.');
    const ultimaFilaConDatos = hojaDestino.getLastRow();
    const rangoNombres = hojaDestino.getRange("B3:B" + ultimaFilaConDatos);
    const listadoActual = rangoNombres.getValues().flat();
    const listadoNormalizado = new Set(listadoActual.map(n => normalizarTexto_(n)));
    if (listadoNormalizado.has(nombreNormalizado)) {
      ui.alert('Alumno Duplicado', `El alumno "${nombreCompleto}" ya existe.`, ui.ButtonSet.OK);
      return;
    }
    const proximaFilaVacia = ultimaFilaConDatos + 1;
    hojaDestino.getRange(proximaFilaVacia, 2).setValue(nombreCompleto);
    ui.alert('Éxito', `Se ha agregado a "${nombreCompleto}" en la fila ${proximaFilaVacia}.`, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log(`ERROR en procesarNuevoAlumno: ${e.message} ${e.stack}`);
    ui.alert('Error', `Ocurrió un error: ${e.message}`, ui.ButtonSet.OK);
  }
}

function iniciarCreacionListado() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  const properties = PropertiesService.getScriptProperties();
  const esPrimeraEjecucion = properties.getProperty('contadorAlumnos') === null;
  if (esPrimeraEjecucion) {
    properties.setProperty('contadorAlumnos', '0');
    try {
      SpreadsheetApp.getUi().alert('Iniciando actualización', 'Buscando nuevos alumnos en Drive...', SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {}
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaControl = ss.getSheetByName(HOJA_CONTROL);
    const filaEncabezados = _encontrarFilaEncabezados(hojaControl);
    const primeraFilaDatos = filaEncabezados + 1;
    borrarTriggersAnteriores_('iniciarCreacionListado');
    const tiempoInicio = new Date().getTime();
    const lastRowData = hojaControl.getLastRow() >= primeraFilaDatos ? hojaControl.getLastRow() - filaEncabezados : 0;
    const rangoDatos = lastRowData > 0 ? hojaControl.getRange(primeraFilaDatos, 1, lastRowData, 2).getValues() : [];
    const alumnosSinId = new Map();
    const alumnosExistentes = new Set();
    rangoDatos.forEach((fila, index) => {
      const [id, nombre] = fila;
      if (nombre) {
        const nombreNormalizado = normalizarTexto_(nombre);
        alumnosExistentes.add(nombreNormalizado);
        if (!id) alumnosSinId.set(nombreNormalizado, { filaIndex: index });
      }
    });
    let query = 'title contains " - Rutina"';
    const carpetasArchivados = DriveApp.getFoldersByName(CARPETA_ARCHIVADOS);
    if (carpetasArchivados.hasNext()) {
      query += ` and not '${carpetasArchivados.next().getId()}' in parents`;
    }
    const archivos = DriveApp.searchFiles(query);
    const alumnosNuevosParaAnadir = [];
    let seHicieronCambios = false;
    while (archivos.hasNext()) {
      if (new Date().getTime() - tiempoInicio > TIEMPO_MAX_EJECUCION) break;
      const archivo = archivos.next();
      const nombreArchivo = archivo.getName().split(" - Rutina")[0];
      const nombreNormalizado = normalizarTexto_(nombreArchivo);
      const idArchivo = archivo.getId();
      if (alumnosSinId.has(nombreNormalizado)) {
        const infoAlumno = alumnosSinId.get(nombreNormalizado);
        hojaControl.getRange(infoAlumno.filaIndex + primeraFilaDatos, 1).setValue(idArchivo);
        alumnosSinId.delete(nombreNormalizado);
        seHicieronCambios = true;
      } else if (!alumnosExistentes.has(nombreNormalizado)) {
        alumnosNuevosParaAnadir.push([idArchivo, nombreArchivo, ""]);
        alumnosExistentes.add(nombreNormalizado);
      }
    }
    if (alumnosNuevosParaAnadir.length > 0) {
      properties.setProperty('contadorAlumnos', (parseInt(properties.getProperty('contadorAlumnos')) + alumnosNuevosParaAnadir.length).toString());
      hojaControl.getRange(hojaControl.getLastRow() + 1, 1, alumnosNuevosParaAnadir.length, 3).setValues(alumnosNuevosParaAnadir);
      seHicieronCambios = true;
    }
    if (archivos.hasNext()) {
      ScriptApp.newTrigger('iniciarCreacionListado').timeBased().after(RETRASO_TRIGGER).create();
    } else {
      const totalAnadidos = properties.getProperty('contadorAlumnos') || '0';
      const mensajeFinal = totalAnadidos === '0' ? 'El listado ya estaba actualizado.' : `Proceso completado. Se añadieron ${totalAnadidos} nuevos alumnos.`;
      try {
        SpreadsheetApp.getUi().alert('✅ ¡Actualización finalizada!', mensajeFinal, SpreadsheetApp.getUi().ButtonSet.OK);
      } catch (e) {}
      if (seHicieronCambios) eliminarNombresDuplicados_();
      properties.deleteProperty('contadorAlumnos');
    }
  } catch (e) {
    Logger.log(`ERROR CRÍTICO en iniciarCreacionListado: ${e.message} ${e.stack}`);
    SpreadsheetApp.getUi().alert(`Error en 'Actualizar listado': ${e.message}`);
  } finally {
    lock.releaseLock();
  }
}

function iniciarExtraccionActividad(e) {
  const ui = SpreadsheetApp.getUi();
  const esEjecucionManual = (e === undefined);
  try {
    if (esEjecucionManual) {
      const respuesta = ui.alert("Confirmación", "¿Deseas empezar el análisis desde cero? Esto borrará el estado 'Procesado' de todos los alumnos.", ui.ButtonSet.YES_NO);
      if (respuesta === ui.Button.YES) {
        const hojaControl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONTROL);
        const headerRow = _encontrarFilaEncabezados(hojaControl);
        const colPIndex = hojaControl.getRange(COLUMNA_ESTADO_ACTIVIDAD + "1").getColumn();
        const rangoProcesado = hojaControl.getRange(headerRow + 1, colPIndex, hojaControl.getLastRow() - headerRow);
        rangoProcesado.clearContent();
        SpreadsheetApp.flush();
        ui.alert("Se ha reiniciado el estado de los alumnos. El proceso comenzará ahora.");
      } else {
        ui.alert("Continuando con los alumnos pendientes.");
      }
    }
    procesarLoteDeActividad();
  } catch (e) {
    Logger.log(`ERROR FATAL en iniciarExtraccionActividad: ${e.message} ${e.stack}`);
    ui.alert(`Error al iniciar el proceso: ${e.message}`);
  }
}

function procesarLoteDeActividad() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  const startTime = new Date();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaControl = ss.getSheetByName(HOJA_CONTROL);
    const headerRow = _encontrarFilaEncabezados(hojaControl);
    const cols = _obtenerMapaDeColumnas(hojaControl, headerRow);
    const idIndex = cols['id'];
    const estadoIndex = cols['estado'];
    const ultimaActividadIndex = cols['ultima activdad'];
    const procesadoColNumber = hojaControl.getRange(COLUMNA_ESTADO_ACTIVIDAD + "1").getColumn();
    const procesadoIndex = procesadoColNumber - 1;
    if (idIndex === undefined || estadoIndex === undefined || ultimaActividadIndex === undefined) {
      throw new Error("Una o más columnas ('ID', 'Estado', 'Ultima activdad') no se encontraron.");
    }
    const rangoDatos = hojaControl.getRange(headerRow + 1, 1, hojaControl.getLastRow() - headerRow, procesadoColNumber).getValues();
    const tareasPendientes = [];
    for (let i = 0; i < rangoDatos.length; i++) {
      if (rangoDatos[i][idIndex] && rangoDatos[i][procesadoIndex] !== "Procesado") {
        tareasPendientes.push({
          rowIndex: headerRow + 1 + i,
          id: rangoDatos[i][idIndex],
          nombre: rangoDatos[i][cols['nombre y apellido']]
        });
      }
    }
    if (tareasPendientes.length === 0) {
      const fechaFin = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
      hojaControl.getRange(headerRow, procesadoColNumber).setValue(`Actividad: ${fechaFin}`);
      borrarTriggersAnteriores_('procesarLoteDeActividad');
      try {
        SpreadsheetApp.getUi().alert("¡Éxito!", "La actualización de actividad ha finalizado.", SpreadsheetApp.getUi().ButtonSet.OK);
      } catch (uiError) {}
      return;
    }
    let tiempoLimiteAlcanzado = false;
    for (const tarea of tareasPendientes) {
      if (new Date().getTime() - startTime.getTime() > TIEMPO_MAX_EJECUCION) {
        borrarTriggersAnteriores_('procesarLoteDeActividad');
        ScriptApp.newTrigger('procesarLoteDeActividad').timeBased().after(RETRASO_TRIGGER).create();
        tiempoLimiteAlcanzado = true;
        break;
      }
      try {
        const spreadsheetUsuario = SpreadsheetApp.openById(tarea.id);
        const hojaEntrenamiento = encontrarHojaEntrenamiento_(spreadsheetUsuario);
        let respuesta = "";
        if (hojaEntrenamiento) {
          const celdaRespuesta = hojaEntrenamiento.getRange("C3");
          respuesta = celdaRespuesta.getValue().toString().trim();
          celdaRespuesta.clearContent();
        }
        if (respuesta.toLowerCase() === "si") {
          hojaControl.getRange(tarea.rowIndex, estadoIndex + 1).setValue("Activo");
          hojaControl.getRange(tarea.rowIndex, ultimaActividadIndex + 1).setValue(new Date());
        } else if (respuesta.toLowerCase() === "quiero repetir semana") {
          hojaControl.getRange(tarea.rowIndex, estadoIndex + 1).setValue("Activo.");
          hojaControl.getRange(tarea.rowIndex, ultimaActividadIndex + 1).setValue(new Date());
        } else {
          hojaControl.getRange(tarea.rowIndex, estadoIndex + 1).setValue("Inactivo");
          hojaControl.getRange(tarea.rowIndex, ultimaActividadIndex + 1).clearContent();
        }
        hojaControl.getRange(tarea.rowIndex, procesadoColNumber).setValue("Procesado");
      } catch (e) {
        Logger.log(`Error procesando a ${tarea.nombre}: ${e.message}`);
        hojaControl.getRange(tarea.rowIndex, procesadoColNumber).setValue(`Error`);
      }
    }
    if (!tiempoLimiteAlcanzado) {
      const fechaFin = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
      hojaControl.getRange(headerRow, procesadoColNumber).setValue(`Actividad: ${fechaFin}`);
      borrarTriggersAnteriores_('procesarLoteDeActividad');
      try {
        SpreadsheetApp.getUi().alert("¡Éxito!", "La actualización de actividad ha finalizado.", SpreadsheetApp.getUi().ButtonSet.OK);
      } catch (e) {}
    }
  } catch (e) {
    Logger.log(`ERROR CRITICO en procesarLoteDeActividad: ${e.message} ${e.stack}`);
  } finally {
    lock.releaseLock();
  }
}

function iniciarGestionEntrenamiento(e) {
  const ui = SpreadsheetApp.getUi();
  const esEjecucionManual = (e === undefined);
  const properties = PropertiesService.getScriptProperties();
  try {
    if (esEjecucionManual) {
      borrarTriggersAnteriores_('procesarLoteDePlanificaciones');
      const respuestaModo = ui.alert('¿Qué semana deseas actualizar?', 'Presiona "SÍ" para la SEMANA QUE VIENE.\nPresiona "NO" para la SEMANA ACTUAL.', ui.ButtonSet.YES_NO);
      let modoActualizacion;
      if (respuestaModo == ui.Button.YES) {
        modoActualizacion = "Semana que viene";
      } else if (respuestaModo == ui.Button.NO) {
        modoActualizacion = "Semana actual";
      } else {
        ui.alert('Operación cancelada.');
        return;
      }
      properties.setProperty('modoActualizacionPlanificaciones', modoActualizacion);
      const respuestaReset = ui.alert("Confirmación", "¿Deseas empezar el análisis desde cero? Esto borrará el estado 'Actualizada' de todos los alumnos.", ui.ButtonSet.YES_NO);
      if (respuestaReset === ui.Button.YES) {
        const hojaControl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONTROL);
        const headerRow = _encontrarFilaEncabezados(hojaControl);
        const colQIndex = hojaControl.getRange(COLUMNA_ESTADO_PLANIFICACION + "1").getColumn();
        hojaControl.getRange(headerRow + 1, colQIndex, hojaControl.getMaxRows() - headerRow).clearContent();
        SpreadsheetApp.flush();
      }
    }
    ui.alert("Iniciando Actualización de Planificaciones", "Este proceso puede tardar varios minutos.", ui.ButtonSet.OK);
    procesarLoteDePlanificaciones();
  } catch (e) {
    Logger.log(`ERROR FATAL en iniciarGestionEntrenamiento: ${e.message} ${e.stack}`);
    ui.alert(`Error al iniciar el proceso: ${e.message}`);
  }
}

function procesarLoteDePlanificaciones() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  const startTime = new Date();
  const properties = PropertiesService.getScriptProperties();
  const modoActualizacion = properties.getProperty('modoActualizacionPlanificaciones');
  if (!modoActualizacion) {
    lock.releaseLock();
    return;
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaControl = ss.getSheetByName(HOJA_CONTROL);
    const headerRow = _encontrarFilaEncabezados(hojaControl);
    const cols = _obtenerMapaDeColumnas(hojaControl, headerRow);
    const idIndex = cols['id'];
    const estadoIndex = cols['estado'];
    const rutinaColNumber = hojaControl.getRange(COLUMNA_ESTADO_PLANIFICACION + "1").getColumn();
    const rutinaIndex = rutinaColNumber - 1;
    const rangoDatos = hojaControl.getRange(headerRow + 1, 1, hojaControl.getLastRow() - headerRow, rutinaColNumber).getValues();
    const tareasPendientes = [];
    for (let i = 0; i < rangoDatos.length; i++) {
      const estadoActual = rangoDatos[i][estadoIndex] ? rangoDatos[i][estadoIndex].toString().toLowerCase() : "";
      if (rangoDatos[i][idIndex] && estadoActual.startsWith('activo') && rangoDatos[i][rutinaIndex] !== "Actualizada") {
        tareasPendientes.push({
          rowIndex: headerRow + 1 + i,
          id: rangoDatos[i][idIndex],
          nombre: rangoDatos[i][cols['nombre y apellido']],
          estado: rangoDatos[i][estadoIndex]
        });
      }
    }
    if (tareasPendientes.length === 0) {
      const fechaFin = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
      hojaControl.getRange(headerRow, rutinaColNumber).setValue(`Rutina: ${fechaFin}`);
      properties.deleteProperty('modoActualizacionPlanificaciones');
      borrarTriggersAnteriores_('procesarLoteDePlanificaciones');
      try {
        SpreadsheetApp.getUi().alert("¡Éxito!", "La actualización de planificaciones ha finalizado.", SpreadsheetApp.getUi().ButtonSet.OK);
      } catch (uiError) {}
      return;
    }
    let tiempoLimiteAlcanzado = false;
    for (const tarea of tareasPendientes) {
      if (new Date().getTime() - startTime.getTime() > TIEMPO_MAX_EJECUCION) {
        borrarTriggersAnteriores_('procesarLoteDePlanificaciones');
        ScriptApp.newTrigger('procesarLoteDePlanificaciones').timeBased().after(RETRASO_TRIGGER).create();
        tiempoLimiteAlcanzado = true;
        break;
      }
      try {
        if (tarea.estado === "Activo") realizarTareasPreActualizacion_(tarea.id);
        const fechaElegida = calcularFechaObjetivo_(modoActualizacion);
        const esRepetirSemana = (tarea.estado === "Activo.");
        const fechaABuscar = esRepetirSemana ? new Date(fechaElegida.getTime() - 7 * 24 * 60 * 60 * 1000) : fechaElegida;
        const resultado = procesarYExtraerEntrenamiento_(tarea.id, fechaABuscar, esRepetirSemana, fechaElegida);
        hojaControl.getRange(tarea.rowIndex, rutinaColNumber).setValue(resultado.rutinaStatus);
        if (resultado.entrenamientoInfo.error) {
          hojaControl.getRange(tarea.rowIndex, cols['bloque'] + 1).setValue(resultado.entrenamientoInfo.error);
          hojaControl.getRange(tarea.rowIndex, cols['fecha'] + 1).clearContent();
          hojaControl.getRange(tarea.rowIndex, cols['semana'] + 1).clearContent();
        } else {
          hojaControl.getRange(tarea.rowIndex, cols['fecha'] + 1).setValue(resultado.entrenamientoInfo.fecha);
          hojaControl.getRange(tarea.rowIndex, cols['semana'] + 1).setValue(resultado.entrenamientoInfo.semana);
          hojaControl.getRange(tarea.rowIndex, cols['bloque'] + 1).setValue(resultado.entrenamientoInfo.bloque);
        }
      } catch (e) {
        Logger.log(`ERROR CRÍTICO procesando a ${tarea.nombre}: ${e.message} ${e.stack}`);
        hojaControl.getRange(tarea.rowIndex, rutinaColNumber).setValue("Error Crítico");
      }
    }
    if (!tiempoLimiteAlcanzado) {
      const fechaFin = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
      hojaControl.getRange(headerRow, rutinaColNumber).setValue(`Rutina: ${fechaFin}`);
      properties.deleteProperty('modoActualizacionPlanificaciones');
      borrarTriggersAnteriores_('procesarLoteDePlanificaciones');
      try {
        SpreadsheetApp.getUi().alert("¡Éxito!", "La actualización de planificaciones ha finalizado.", SpreadsheetApp.getUi().ButtonSet.OK);
      } catch (uiError) {}
    }
  } catch (e) {
    Logger.log(`ERROR CRÍTICO en procesarLoteDePlanificaciones: ${e.message} ${e.stack}`);
  } finally {
    lock.releaseLock();
  }
}

function iniciarActualizacionGeneral() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  const properties = PropertiesService.getScriptProperties();
  const esPrimeraEjecucion = properties.getProperty('indiceClienteActual') === null;
  if (esPrimeraEjecucion) {
    properties.setProperty('indiceClienteActual', '0');
    properties.setProperty('resumenPagos', JSON.stringify({}));
    SpreadsheetApp.getUi().alert("Iniciando Proceso de Pagos...", "Se actualizarán las cuentas en segundo plano...", SpreadsheetApp.getUi().ButtonSet.OK);
  }
  try {
    actualizacionGeneralClientes();
  } catch (e) {
    Logger.log(`Error fatal en la ejecución de pagos: ${e.message} ${e.stack}`);
    finalizarProceso_('indiceClienteActual', 'iniciarActualizacionGeneral');
  } finally {
    lock.releaseLock();
  }
}

function actualizacionGeneralClientes() {
  const properties = PropertiesService.getScriptProperties();
  const startTime = new Date().getTime();
  const hojaControl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONTROL);
  if (!hojaControl) return;
  const datosUsuarios = obtenerDatosConEncabezados(hojaControl);
  if (!datosUsuarios) {
    SpreadsheetApp.getUi().alert("Error: No se pudieron leer los datos de 'Control de usuarios'.");
    return;
  }
  const clientesParaProcesar = datosUsuarios.data.filter(u => u["Estado"] && u["Estado"].toString().toLowerCase().startsWith('activo'));
  const indiceInicio = parseInt(properties.getProperty('indiceClienteActual') || '0');
  let resumenPagos = JSON.parse(properties.getProperty('resumenPagos') || '{}');
  for (let i = indiceInicio; i < clientesParaProcesar.length; i++) {
    const cliente = clientesParaProcesar[i];
    if (new Date().getTime() - startTime > TIEMPO_MAX_EJECUCION) {
      properties.setProperty('indiceClienteActual', i.toString());
      properties.setProperty('resumenPagos', JSON.stringify(resumenPagos));
      borrarTriggersAnteriores_('iniciarActualizacionGeneral');
      ScriptApp.newTrigger('iniciarActualizacionGeneral').timeBased().after(RETRASO_TRIGGER).create();
      return;
    }
    marcarDeudas(cliente);
    procesarPagos(cliente);
    crearYVerificarVencimientos(cliente);
    const infoPagos = extraerInfoPagos(cliente);
    if (infoPagos) {
      const filaCliente = datosUsuarios.data.findIndex(u => u["ID"] === cliente["ID"]) + datosUsuarios.headerRow + 1;
      resumenPagos[filaCliente] = infoPagos;
    }
  }
  escribirDatosDePagosEnBloque(hojaControl, resumenPagos, datosUsuarios.headers);
  finalizarProceso_('indiceClienteActual', 'iniciarActualizacionGeneral');
  properties.deleteProperty('resumenPagos');
  SpreadsheetApp.getUi().alert("✅ ¡Proceso de Pagos Completado!", "Se han actualizado todas las cuentas de los clientes activos.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function marcarDeudas(cliente) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const idCliente = cliente["ID"];
  try {
    const ssCliente = SpreadsheetApp.openById(idCliente);
    const hojaPagos = ssCliente.getSheetByName("Pagos");
    if (!hojaPagos) return;
    const datosPagosObj = obtenerDatosPagos(hojaPagos);
    if (!datosPagosObj || datosPagosObj.data.length === 0) return;
    const rangoCompletoPagos = hojaPagos.getRange(datosPagosObj.headerRow + 1, 2, datosPagosObj.data.length, 1);
    const valoresPagos = rangoCompletoPagos.getValues();
    let hayCambios = false;
    let deudasMarcadas = 0;
    datosPagosObj.data.forEach((fila, index) => {
      if (fila["Fecha de Inicio"]) {
        const fechaInicio = new Date(fila["Fecha de Inicio"]);
        const valorPago = valoresPagos[index][0];
        if (fechaInicio < hoy && !valorPago) {
          valoresPagos[index][0] = "DEBE";
          hayCambios = true;
          deudasMarcadas++;
        }
      }
    });
    if (hayCambios) {
      rangoCompletoPagos.setValues(valoresPagos).setFontFamily("Calibri").setFontSize(11).setHorizontalAlignment("center");
    }
  } catch (e) {
    Logger.log(`ERROR marcando deudas para ${cliente["Nombre y apellido"]}: ${e.message}`);
  }
}

function procesarPagos(cliente) {
  const idCliente = cliente["ID"];
  const nombreCliente = cliente["Nombre y apellido"];
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaNovedades = ss.getSheetByName("Novedades");
    if (!hojaNovedades) return;
    const datosNovedades = obtenerDatosConEncabezados(hojaNovedades);
    if (!datosNovedades) return;
    const pagosPendientes = datosNovedades.data
      .map((fila, index) => ({...fila, rowIndex: datosNovedades.headerRow + 1 + index }))
      .filter(novedad => !novedad["Estado"] || novedad["Estado"].toString().toLowerCase() !== 'cargado');
    const pagosDelCliente = pagosPendientes.filter(p => p["Nombre y apellido"] === nombreCliente);
    if (pagosDelCliente.length > 0) {
      const mensualidadesSettings = obtenerConfiguracionMensualidades(ss.getSheetByName("Settings"));
      if (!mensualidadesSettings) return;
      pagosDelCliente.sort((a, b) => new Date(a["Fecha y hora"]) - new Date(b["Fecha y hora"]));
      pagosDelCliente.forEach(pago => {
        const producto = pago["Producto"] ? pago["Producto"].toString().trim() : "";
        if (mensualidadesSettings[producto]) {
          const cantidad = pago["Cantidad"] || 1;
          const settingsProducto = mensualidadesSettings[producto];
          const mesesACargar = cantidad * settingsProducto.mesesEquivale;
          const importeIndividual = settingsProducto.precioIndividual;
          const textoAMostrar = settingsProducto.textoAMostrar;
          let exito = false;
          if (settingsProducto.mesesEquivale > 1) {
            exito = actualizarHojaPagos_MultiMes(idCliente, pago["Fecha y hora"], importeIndividual, mesesACargar, textoAMostrar);
          } else {
            exito = actualizarHojaPagos_Simple(idCliente, pago["Fecha y hora"], importeIndividual, mesesACargar, textoAMostrar);
          }
          if (exito) hojaNovedades.getRange(pago.rowIndex, 7).setValue("Cargado");
        }
      });
    }
  } catch (e) {
    Logger.log(`ERROR CRÍTICO en procesarPagos para ${nombreCliente}: ${e.message}`);
  }
}

function crearYVerificarVencimientos(cliente) {
  const idCliente = cliente["ID"];
  const nombreCliente = cliente["Nombre y apellido"];
  try {
    const ssCliente = SpreadsheetApp.openById(idCliente);
    const hojaPagos = ssCliente.getSheetByName("Pagos");
    if (!hojaPagos) return;
    const datosPagosObj = obtenerDatosPagos(hojaPagos);
    if (!datosPagosObj || datosPagosObj.data.length === 0) return;
    const ultimaFilaConFecha = encontrarUltimaFilaConFecha_(hojaPagos);
    if (ultimaFilaConFecha === -1) return;
    const rangoPago = hojaPagos.getRange(ultimaFilaConFecha, 2);
    let estaPagada = !rangoPago.isBlank();
    if (!estaPagada && rangoPago.isPartOfMerge()) {
      if (!rangoPago.getMergedRanges()[0].getCell(1, 1).isBlank()) estaPagada = true;
    }
    if (estaPagada) {
      let mesesCubiertos = 1;
      let filaDeReferencia = ultimaFilaConFecha;
      if (rangoPago.isPartOfMerge()) {
        const rangoCombinado = rangoPago.getMergedRanges()[0];
        mesesCubiertos = rangoCombinado.getNumRows();
        filaDeReferencia = rangoCombinado.getRow();
      }
      const fechaInicioBase = new Date(hojaPagos.getRange(filaDeReferencia, 1).getValue());
      const ultimoPlanConocido = hojaPagos.getRange(filaDeReferencia, 4).getValue();
      const fechaVencimientoNueva = _addMonths(fechaInicioBase, mesesCubiertos);
      const nuevaFila = hojaPagos.getLastRow() + 1;
      hojaPagos.appendRow([fechaVencimientoNueva, "", "", ultimoPlanConocido, ""]);
      const rangoNuevaFila = hojaPagos.getRange(nuevaFila, 1, 1, 5);
      rangoNuevaFila.setFontFamily("Calibri").setFontSize(11).setHorizontalAlignment("center");
      hojaPagos.getRange(nuevaFila, 1).setNumberFormat("dd/MM/yyyy");
    }
  } catch (e) {
    Logger.log(`ERROR creando/verificando vencimiento para ${nombreCliente}: ${e.message}`);
  }
}

function extraerInfoPagos(cliente) {
  try {
    const hojaPagos = SpreadsheetApp.openById(cliente["ID"]).getSheetByName('Pagos');
    if (!hojaPagos) return null;
    const datosPagos = hojaPagos.getDataRange().getValues();
    if (datosPagos.length < 2) return { fechaInicio: "Hoja 'Pagos' vacía" };
    let ultimaFechaInicio = "", ultimoPlan = "", fechaMasReciente = null, contadorDebe = 0;
    const hoy = new Date();
    for (let j = 1; j < datosPagos.length; j++) {
      const [valorFechaInicio, valorPago, , valorPlan] = datosPagos[j];
      if (valorFechaInicio instanceof Date) ultimaFechaInicio = valorFechaInicio;
      if (valorPlan) ultimoPlan = valorPlan;
      if (String(valorPago).toUpperCase().trim() === 'DEBE') {
        contadorDebe++;
      } else if (valorPago instanceof Date) {
        if (valorPago <= hoy && (!fechaMasReciente || valorPago > fechaMasReciente)) {
          fechaMasReciente = valorPago;
        }
      }
    }
    return { fechaInicio: ultimaFechaInicio, plan: ultimoPlan, fechaPago: fechaMasReciente, deudas: contadorDebe };
  } catch (e) {
    Logger.log(`ERROR extrayendo info de pagos: ${e.message}`);
    return { fechaInicio: `Error: ${e.message.substring(0, 50)}` };
  }
}

function escribirDatosDePagosEnBloque(hojaControl, resumenPagos, headers) {
  if (Object.keys(resumenPagos).length === 0) return;
  const colFechaInicio = headers["Fecha de inicio"];
  const colPlan = headers["Plan"];
  const colFechaPago = headers["Fecha de pago"];
  const colDeudas = headers["Deudas"];
  const rangoCompleto = hojaControl.getDataRange();
  const valoresCompletos = rangoCompleto.getValues();
  for (const fila in resumenPagos) {
    const info = resumenPagos[fila];
    const rowIndex = fila - 1;
    if (valoresCompletos[rowIndex]) {
      valoresCompletos[rowIndex][colFechaInicio] = info.fechaInicio;
      valoresCompletos[rowIndex][colPlan] = info.plan;
      valoresCompletos[rowIndex][colFechaPago] = info.fechaPago;
      valoresCompletos[rowIndex][colDeudas] = info.deudas;
    }
  }
  rangoCompleto.setValues(valoresCompletos);
}

function realizarTareasPreActualizacion_(userId) {
  try {
    const ss = SpreadsheetApp.openById(userId);
    const hojaEntrenamiento = encontrarHojaEntrenamiento_(ss);
    if (!hojaEntrenamiento) return;
    const hojaProg1 = ss.getSheetByName("Prog1");
    if (!hojaProg1) return;
    const datosCompletos = hojaEntrenamiento.getDataRange().getValues();
    const filasClave = encontrarFilasClave_(datosCompletos);
    if (!filasClave) return;
    const analisis = analizarEstructuraDeBloques_(hojaEntrenamiento, filasClave.headerRow);
    if (analisis.error || !analisis.visible) return;
    const colSeries = analisis.visible.startCol;
    const filaEncabezados = filasClave.headerRow;
    const textoCelda1 = datosCompletos[filaEncabezados - 2][colSeries] ? datosCompletos[filaEncabezados - 2][colSeries].toString().trim().toUpperCase() : "";
    const textoCelda2 = datosCompletos[filaEncabezados - 3][colSeries] ? datosCompletos[filaEncabezados - 3][colSeries].toString().trim().toUpperCase() : "";
    if (textoCelda1 === "TEST RM" || textoCelda2 === "TEST RM") {
      cargarRMs_(hojaEntrenamiento, hojaProg1, datosCompletos, filasClave, analisis);
      return;
    }
    if (textoCelda2 === "AL MÁXIMO (RM)") {
      const ultimaFilaDia = encontrarUltimaFilaDia_(datosCompletos, 11);
      const colFinRango = analisis.visible.startCol;
      const rangoAConvertir = hojaEntrenamiento.getRange(11, 4, ultimaFilaDia - 10, colFinRango - 3);
      rangoAConvertir.setValues(rangoAConvertir.getValues());
      cargarRMs_(hojaEntrenamiento, hojaProg1, datosCompletos, filasClave, analisis);
      const headers = datosCompletos[filasClave.headerRow - 1];
      let colPesoIndex = -1;
      for (let i = analisis.visible.startCol; i <= analisis.visible.endCol; i++) {
        const headerValue = headers[i] ? headers[i].toString().trim().toUpperCase() : "";
        if (headerValue === 'PESO') {
          colPesoIndex = i;
          break;
        }
      }
      if (colPesoIndex !== -1) {
        const colFormulaCheck = colPesoIndex + 2;
        const celdaFormula = hojaEntrenamiento.getRange(14, colFormulaCheck);
        if (!celdaFormula.getFormula()) {
          copiarBloqueAnterior_(hojaEntrenamiento, filasClave, analisis, ultimaFilaDia);
        }
      }
    }
  } catch (e) {
    Logger.log(`ERROR durante las tareas de pre-actualización: ${e.message} ${e.stack}`);
  }
}

function cargarRMs_(hojaEntrenamiento, hojaProg1, datos, filasClave, analisis) {
  const bloqueVisible = analisis.visible;
  const datosCompletos = hojaEntrenamiento.getDataRange().getValues();
  const mapaColumnas = {};
  const encabezados = datos[filasClave.headerRow - 1].slice(bloqueVisible.startCol, bloqueVisible.endCol + 1);
  encabezados.forEach((h, i) => mapaColumnas[h.toString().toUpperCase().trim()] = i);
  if (mapaColumnas['SERIES'] === undefined || mapaColumnas['REPES'] === undefined || mapaColumnas['PESO'] === undefined) return;
  let rmsPorDia = {};
  for (let i = filasClave.headerRow; i < datosCompletos.length; i++) {
    const dia = datosCompletos[i][0] ? datosCompletos[i][0].toString().trim() : "";
    if (!dia) continue;
    const series = datosCompletos[i][bloqueVisible.startCol + mapaColumnas['SERIES']];
    const repes = datosCompletos[i][bloqueVisible.startCol + mapaColumnas['REPES']];
    if (series == 1 && repes == 1) {
      if (!rmsPorDia[dia]) rmsPorDia[dia] = [];
      const peso = datosCompletos[i][bloqueVisible.startCol + mapaColumnas['PESO']];
      const ejercicio = datosCompletos[i][2];
      rmsPorDia[dia].push({ peso, ejercicio });
    }
  }
  for (const dia in rmsPorDia) {
    if (rmsPorDia[dia].length > 1) return;
  }
  const celdasProg1 = {
    "Lunes": { peso: "B8", ejercicio: "A1" },
    "Martes": { peso: "B18", ejercicio: "A11" },
    "Miércoles": { peso: "B28", ejercicio: "A21" },
    "Jueves": { peso: "G8", ejercicio: "F1" },
    "Viernes": { peso: "G18", ejercicio: "F11" },
    "Sábado": { peso: "G28", ejercicio: "F21" }
  };
  for (const dia in rmsPorDia) {
    if (celdasProg1[dia]) {
      const rmInfo = rmsPorDia[dia][0];
      const pesoNum = parseFloat(rmInfo.peso);
      if (!isNaN(pesoNum)) {
        const pesoRedondeado = Math.round(pesoNum / 2.5) * 2.5;
        const nombreEjercicio = rmInfo.ejercicio.replace(/\(Programa\)/i, "").trim().toUpperCase();
        const textoPrograma = `PROGRAMA DE ${nombreEjercicio}`;
        hojaProg1.getRange(celdasProg1[dia].peso).setValue(pesoRedondeado);
        hojaProg1.getRange(celdasProg1[dia].ejercicio).setValue(textoPrograma);
      }
    }
  }
  try {
    const spreadsheet = hojaEntrenamiento.getParent();
    const hojaAvances = spreadsheet.getSheetByName("Avances");
    if (!hojaAvances) return;
    const normalizar = (texto) => texto.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const fechaDelBloque = datos[filasClave.blockTitleRow - 2][analisis.visible.startCol];
    if (!(fechaDelBloque instanceof Date)) return;
    const colCValues = hojaAvances.getRange("C1:C" + hojaAvances.getMaxRows()).getValues();
    let filaDestino = -1;
    const fechaBusqueda = new Date(fechaDelBloque);
    fechaBusqueda.setHours(0, 0, 0, 0);
    for (let i = 0; i < colCValues.length; i++) {
      const celda = colCValues[i][0];
      if (celda instanceof Date) {
        const fechaCelda = new Date(celda);
        fechaCelda.setHours(0, 0, 0, 0);
        if (fechaCelda.getTime() === fechaBusqueda.getTime()) {
          filaDestino = i + 1;
          break;
        }
      }
    }
    if (filaDestino === -1) {
      filaDestino = colCValues.findIndex(row => row[0] === "") + 1;
      if (filaDestino === 0) filaDestino = hojaAvances.getLastRow() + 1;
      hojaAvances.getRange(filaDestino, 3).setValue(fechaDelBloque);
    }
    const datosAvances = hojaAvances.getDataRange().getValues();
    const filaEncabezadosIndex = datosAvances.findIndex(fila => fila.some(celda => celda.toString().trim() === "Fechas RM"));
    if (filaEncabezadosIndex === -1) return;
    const encabezadosAvances = datosAvances[filaEncabezadosIndex];
    const mapaEncabezados = {};
    encabezadosAvances.forEach((encabezado, i) => {
      if (encabezado) mapaEncabezados[normalizar(encabezado)] = i + 1;
    });
    for (const dia in rmsPorDia) {
      const rmInfo = rmsPorDia[dia][0];
      let nombreEjercicioNorm = normalizar(rmInfo.ejercicio.replace(/\(programa\)/i, ""));
      if (nombreEjercicioNorm.includes("peso muerto sumo")) nombreEjercicioNorm = normalizar("Peso Muerto S");
      const columnaDestino = mapaEncabezados[nombreEjercicioNorm];
      if (columnaDestino) {
        const pesoNum = parseFloat(rmInfo.peso);
        if (!isNaN(pesoNum)) {
          const pesoRedondeado = Math.round(pesoNum / 2.5) * 2.5;
          hojaAvances.getRange(filaDestino, columnaDestino).setValue(pesoRedondeado);
        }
      }
    }
  } catch (e) {
    Logger.log(`ERROR al intentar registrar RMs en la hoja 'Avances': ${e.message}`);
  }
}

function copiarBloqueAnterior_(hojaEntrenamiento, filasClave, analisis, ultimaFilaDia) {
  try {
    const indiceVisible = analisis.visibleIndex;
    if (indiceVisible < 2 || indiceVisible >= analisis.todos.length - 1) return;
    const bloqueFuente = analisis.todos[indiceVisible - 2];
    const bloqueDestino = analisis.todos[indiceVisible + 1];
    const colFuenteSeries = bloqueFuente.index + 1;
    const colFuentePeso = colFuenteSeries + 3;
    const colDestinoSeries = bloqueDestino.index + 1;
    const numColumnas = (colFuentePeso - colFuenteSeries) + 1;
    const numFilas = ultimaFilaDia - 10;
    const rangoFuente = hojaEntrenamiento.getRange(11, colFuenteSeries, numFilas, numColumnas);
    const rangoDestino = hojaEntrenamiento.getRange(11, colDestinoSeries, numFilas, numColumnas);
    const ejerciciosDestino = hojaEntrenamiento.getRange(11, 3, numFilas, 1).getValues();
    const valoresFuente = rangoFuente.getValues();
    const valoresOriginalesDestino = rangoDestino.getValues();
    const nuevosValoresDestino = [];
    for (let i = 0; i < valoresFuente.length; i++) {
      const ejercicioActual = ejerciciosDestino[i][0] ? ejerciciosDestino[i][0].toString() : "";
      if (ejercicioActual.toLowerCase().includes("(programa)")) {
        nuevosValoresDestino.push(valoresOriginalesDestino[i]);
      } else {
        nuevosValoresDestino.push(valoresFuente[i]);
      }
    }
    rangoDestino.setValues(nuevosValoresDestino);
  } catch (e) {
    Logger.log(`ERROR en copiarBloqueAnterior_: ${e.message}`);
  }
}

function encontrarUltimaFilaDia_(datos, filaInicial) {
  let ultimaFila = filaInicial;
  for (let i = filaInicial - 1; i < datos.length; i++) {
    if (datos[i] && datos[i][0] && datos[i][0].toString().trim() !== "") {
      ultimaFila = i + 1;
    } else {
      break;
    }
  }
  return ultimaFila;
}

function procesarYExtraerEntrenamiento_(userId, fechaABuscar, esRepetirSemana, fechaElegida) {
  try {
    const ss = SpreadsheetApp.openById(userId);
    const hojaEntrenamiento = encontrarHojaEntrenamiento_(ss);
    if (!hojaEntrenamiento) throw new Error("Hoja de entrenamiento no encontrada");
    const datosCompletos = hojaEntrenamiento.getDataRange().getValues();
    if (datosCompletos.length === 0) throw new Error("Hoja de entrenamiento vacía");
    const filasClave = encontrarFilasClave_(datosCompletos);
    if (!filasClave) throw new Error("No se encontró 'DÍA' en Col A");
    const { colIndex, header } = encontrarColumnaDeFecha_(datosCompletos, filasClave.dateRow, fechaABuscar);
    if (colIndex === -1) throw new Error(`Fecha a buscar (${fechaABuscar.toLocaleDateString()}) no existente`);
    if (header !== 'SERIES' && header !== 'PESO') throw new Error("La estructura de encabezados sobre la fecha no es 'SERIES' o 'PESO'");
    if (esRepetirSemana) {
      const celdaFecha = hojaEntrenamiento.getRange(filasClave.dateRow, colIndex);
      celdaFecha.setValue(fechaElegida);
    }
    let columnasVisibles = (header === 'SERIES') ? determinarBloqueSeries_(datosCompletos[filasClave.headerRow - 1], colIndex) : determinarBloquePeso_(datosCompletos[filasClave.headerRow - 1], colIndex);
    if (hojaEntrenamiento.getLastColumn() > 3) hojaEntrenamiento.hideColumns(4, hojaEntrenamiento.getLastColumn() - 3);
    columnasVisibles.forEach(col => hojaEntrenamiento.showColumns(col.start, col.count || 1));
    SpreadsheetApp.flush();
    const datosActualizados = hojaEntrenamiento.getDataRange().getValues();
    const analisisActualizado = analizarEstructuraDeBloques_(hojaEntrenamiento, filasClave.headerRow);
    if (analisisActualizado.error) throw new Error(analisisActualizado.error);
    const infoExtraida = extraerDatosDelBloque_(datosActualizados, analisisActualizado, filasClave);
    return { rutinaStatus: "Actualizada", entrenamientoInfo: infoExtraida };
  } catch (e) {
    Logger.log(`ERROR en procesarYExtraerEntrenamiento_: ${e.message}`);
    return { rutinaStatus: "Fallo total", entrenamientoInfo: { error: e.message } };
  }
}

function eliminarNombresDuplicados_() {
  const hojaControl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONTROL);
  const filaEncabezados = _encontrarFilaEncabezados(hojaControl);
  const primeraFilaDatos = filaEncabezados + 1;
  const ultimaFila = hojaControl.getLastRow();
  if (ultimaFila < primeraFilaDatos) return;
  const datosIdYNombre = hojaControl.getRange(primeraFilaDatos, 1, ultimaFila - filaEncabezados, 2).getValues();
  const nombresVistos = new Map();
  datosIdYNombre.forEach(([id, nombre], index) => {
    const nombreLimpio = normalizarTexto_(nombre);
    if (nombreLimpio === "") return;
    if (!nombresVistos.has(nombreLimpio)) nombresVistos.set(nombreLimpio, []);
    nombresVistos.get(nombreLimpio).push({ fila: index + primeraFilaDatos, id: id });
  });
  const filasParaBorrar = [];
  nombresVistos.forEach(entradas => {
    if (entradas.length <= 1) return;
    const gruposPorId = new Map();
    entradas.forEach(entrada => {
      if (!gruposPorId.has(entrada.id)) gruposPorId.set(entrada.id, []);
      gruposPorId.get(entrada.id).push(entrada.fila);
    });
    gruposPorId.forEach(filasMismoUsuario => {
      if (filasMismoUsuario.length <= 1) return;
      const filasVacias = [], filasConDatos = [];
      filasMismoUsuario.forEach(numFila => {
        const estaVacia = hojaControl.getRange(numFila, 3, 1, 12).getValues().flat().every(c => c === '');
        (estaVacia ? filasVacias : filasConDatos).push(numFila);
      });
      if (filasConDatos.length > 0) filasParaBorrar.push(...filasVacias);
      else filasParaBorrar.push(...filasVacias.slice(1));
    });
  });
  if (filasParaBorrar.length > 0) {
    [...new Set(filasParaBorrar)].sort((a, b) => b - a).forEach(numFila => hojaControl.deleteRow(numFila));
  }
}

function analizarEstructuraDeBloques_(sheet, headerRow) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const bloquesSeries = headers.map((h, i) => String(h).toUpperCase() === 'SERIES' ? { index: i, header: h } : null).filter(Boolean);
  if (bloquesSeries.length === 0) return { error: "No se encontraron columnas 'SERIES'." };
  let bloqueVisible = null, indiceVisible = -1;
  for (let i = 0; i < bloquesSeries.length; i++) {
    const colIndex = bloquesSeries[i].index;
    if (!sheet.isColumnHiddenByUser(colIndex + 1)) {
      const endCol = (i + 1 < bloquesSeries.length) ? bloquesSeries[i + 1].index - 1 : lastCol - 1;
      bloqueVisible = { startCol: colIndex, endCol, numColumnas: endCol - colIndex + 1 };
      indiceVisible = i;
      break;
    }
  }
  if (!bloqueVisible) return { error: "No se encontró ningún bloque visible." };
  return { visible: bloqueVisible, visibleIndex: indiceVisible, todos: bloquesSeries };
}

function extraerDatosDelBloque_(datos, analisis, filasClave) {
  const titulo = extraerTitulo_(datos, analisis, filasClave.blockTitleRow - 1);
  const resultadoFecha = extraerFecha_(datos, analisis.visible, filasClave.headerRow - 1, filasClave.dateRow - 1);
  const semana = extraerSemana_(datos, analisis.visible, filasClave.weekRow - 1, resultadoFecha.columna);
  return { bloque: titulo, fecha: resultadoFecha.fecha, semana };
}

function extraerTitulo_(datos, analisis, fila) {
  for (let i = analisis.visibleIndex; i >= 0; i--) {
    const titulo = datos[fila][analisis.todos[i].index];
    if (titulo) return titulo;
  }
  return "Sin Título";
}

function extraerFecha_(datos, infoBloque, filaHeader, filaFecha) {
  const { startCol, endCol } = infoBloque;
  let fecha = null, columna = -1;
  for (let i = startCol; i <= endCol; i++) {
    if (String(datos[filaHeader][i]).toUpperCase() === 'PESO' && datos[filaFecha][i] instanceof Date) {
      if (!fecha || datos[filaFecha][i] > fecha) {
        fecha = datos[filaFecha][i];
        columna = i;
      }
    }
  }
  if (fecha) return { fecha, columna };
  if (datos[filaFecha][startCol] instanceof Date) return { fecha: datos[filaFecha][startCol], columna: startCol };
  throw new Error("Fecha no encontrada.");
}

function extraerSemana_(datos, infoBloque, filaSemana, colFecha) {
  return colFecha !== -1 ? datos[filaSemana][colFecha] || "" : "";
}

function calcularFechaObjetivo_(modo) {
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  let diaSemana = hoy.getDay();
  if (diaSemana === 0) diaSemana = 7;
  const diasHastaLunes = diaSemana - 1;
  const lunesEstaSemana = new Date(hoy.getTime());
  lunesEstaSemana.setDate(hoy.getDate() - diasHastaLunes);
  if (modo === "Semana que viene") {
    lunesEstaSemana.setDate(lunesEstaSemana.getDate() + 7);
    return lunesEstaSemana;
  } else {
    return lunesEstaSemana;
  }
}

function encontrarColumnaDeFecha_(datos, dateRow, targetDate) {
  const dateRowIndex = dateRow - 1;
  if (!datos[dateRowIndex]) return { colIndex: -1, header: null };
  const headerRowIndex = dateRow + 2;
  const filaFechas = datos[dateRowIndex];
  for (let i = 0; i < filaFechas.length; i++) {
    const cellValue = filaFechas[i];
    if (cellValue instanceof Date) {
      const targetDateOnly = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const cellDateOnly = new Date(cellValue.getFullYear(), cellValue.getMonth(), cellValue.getDate());
      if (cellDateOnly.getTime() === targetDateOnly.getTime()) {
        return { colIndex: i + 1, header: String(datos[headerRowIndex][i] || '').toUpperCase() };
      }
    }
  }
  return { colIndex: -1, header: null };
}

function determinarBloqueSeries_(filaHeaders, colIndex) {
  let cols = [{ start: colIndex }];
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
  let cols = [{ start: colIndex }];
  ['REST', 'REPES', 'SERIES'].forEach(headerName => {
    for (let i = colIndex - 1; i >= 0; i--) {
      if (String(filaHeaders[i] || '').toUpperCase() === headerName && !cols.some(c => c.start === i + 1)) {
        cols.push({ start: i + 1 });
        break;
      }
    }
  });
  return cols;
}

function encontrarHojaEntrenamiento_(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  const regex = /^entrenamiento(\d*)$/i;
  const candidateSheets = sheets
    .map(sheet => {
      const match = sheet.getName().match(regex);
      if (match) {
        const num = match[1] ? parseInt(match[1], 10) : -1;
        return { sheet, num };
      }
      return null;
    })
    .filter(Boolean);
  if (candidateSheets.length === 0) return null;
  candidateSheets.sort((a, b) => b.num - a.num);
  return candidateSheets[0].sheet;
}

function encontrarFilasClave_(datos) {
  for (let i = 0; i < datos.length; i++) {
    if (datos[i] && datos[i][0] && normalizarTexto_(datos[i][0].toString()).toUpperCase() === 'DIA') {
      const headerRow = i + 1;
      return { headerRow, dateRow: headerRow - 3, weekRow: headerRow - 1, blockTitleRow: headerRow - 2 };
    }
  }
  return null;
}

function finalizarProceso_(propiedad, nombreFuncion) {
  PropertiesService.getScriptProperties().deleteProperty(propiedad);
  if (propiedad === 'lastRow_Actividad') {
    PropertiesService.getScriptProperties().deleteProperty('contadorSi');
  }
  borrarTriggersAnteriores_(nombreFuncion);
}

function borrarTriggersAnteriores_(nombreFuncion) {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === nombreFuncion) ScriptApp.deleteTrigger(trigger);
  });
}

function _encontrarFilaEncabezados(sheet) {
  const data = sheet.getRange("A1:A").getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim().toUpperCase() === 'ID') return i + 1;
  }
  throw new Error(`No se pudo encontrar la fila de encabezados en la hoja "${sheet.getName()}".`);
}

function _obtenerMapaDeColumnas(sheet, headerRow) {
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colMap = {};
  headers.forEach((header, index) => {
    if (header) colMap[header.toString().trim().toLowerCase()] = index;
  });
  return colMap;
}

function capitalizarPalabras_(texto) {
  if (!texto) return "";
  return texto.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

function normalizarTexto_(texto) {
  if (!texto) return "";
  return texto.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function encontrarPuntoDePartida(datosPagos, hoy) {
  for (let i = datosPagos.length - 1; i >= 0; i--) {
    const pago = datosPagos[i];
    if (pago["Fecha de Inicio"]) {
      const fechaInicio = new Date(pago["Fecha de Inicio"]);
      const estaPagado = pago["Fecha de pago"] && !(["", "DEBE"].includes(pago["Fecha de pago"].toString().toUpperCase()));
      if (fechaInicio <= hoy && !estaPagado) return i;
    }
  }
  for (let i = 0; i < datosPagos.length; i++) {
    const pago = datosPagos[i];
    const estaPagado = pago["Fecha de pago"] && !(["", "DEBE"].includes(pago["Fecha de pago"].toString().toUpperCase()));
    if (!estaPagado) return i;
  }
  return datosPagos.length;
}

function actualizarHojaPagos_Simple(sheetId, fechaPago, importeIndividual, mesesACargar, textoAMostrar) {
  const ssCliente = SpreadsheetApp.openById(sheetId);
  const hojaPagos = ssCliente.getSheetByName("Pagos");
  if (!hojaPagos) return false;
  const datosPagosObj = obtenerDatosPagos(hojaPagos);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let filaDePartida = encontrarPuntoDePartida(datosPagosObj.data, hoy);
  for (let i = 0; i < mesesACargar; i++) {
    const filaActualIdx = filaDePartida + i;
    const filaAbsoluta = datosPagosObj.headerRow + 1 + filaActualIdx;
    if (filaActualIdx >= datosPagosObj.data.length) {
      const ultimaFilaAbsoluta = hojaPagos.getLastRow();
      const ultimaFecha = new Date(hojaPagos.getRange(ultimaFilaAbsoluta, 1).getValue());
      const ultimoPlan = hojaPagos.getRange(ultimaFilaAbsoluta, 4).getValue();
      const nuevaFecha = _addMonths(ultimaFecha, 1);
      hojaPagos.appendRow([nuevaFecha, "", "", ultimoPlan, ""]);
    }
    hojaPagos.getRange(filaAbsoluta, 2).setValue(fechaPago).setNumberFormat("dd/MM/yyyy");
    hojaPagos.getRange(filaAbsoluta, 3).setValue(importeIndividual);
    hojaPagos.getRange(filaAbsoluta, 5).setValue(textoAMostrar).setFontWeight("bold");
    hojaPagos.getRange(filaAbsoluta, 1, 1, 5).setFontFamily("Calibri").setFontSize(11).setHorizontalAlignment("center");
  }
  return true;
}

function actualizarHojaPagos_MultiMes(sheetId, fechaPago, importe, mesesACargar, textoAMostrar) {
  const ssCliente = SpreadsheetApp.openById(sheetId);
  const hojaPagos = ssCliente.getSheetByName("Pagos");
  if (!hojaPagos) return false;
  const datosPagosObj = obtenerDatosPagos(hojaPagos);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let filaInicioIdx = encontrarPuntoDePartida(datosPagosObj.data, hoy);
  const filaInicioAbsoluta = datosPagosObj.headerRow + 1 + filaInicioIdx;
  const filasExistentesDesdeInicio = datosPagosObj.data.length - filaInicioIdx;
  const filasACrear = mesesACargar - filasExistentesDesdeInicio;
  if (filasACrear > 0) {
    let ultimaFilaConDatos = hojaPagos.getLastRow();
    for (let i = 0; i < filasACrear; i++) {
      const ultimaFechaInicio = new Date(hojaPagos.getRange(ultimaFilaConDatos, 1).getValue());
      const ultimoPlan = hojaPagos.getRange(ultimaFilaConDatos, 4).getValue();
      const nuevaFecha = _addMonths(ultimaFechaInicio, 1);
      hojaPagos.appendRow([nuevaFecha, "", "", ultimoPlan, ""]);
      ultimaFilaConDatos++;
    }
  }
  const planActual = datosPagosObj.data[filaInicioIdx] ? datosPagosObj.data[filaInicioIdx]["Plan"] : hojaPagos.getRange(hojaPagos.getLastRow(), 4).getValue();
  const rangosParaCombinar = [
    { col: 2, val: fechaPago },
    { col: 3, val: importe },
    { col: 4, val: planActual },
    { col: 5, val: textoAMostrar }
  ];
  rangosParaCombinar.forEach(item => {
    if (item.val) {
      const rango = hojaPagos.getRange(filaInicioAbsoluta, item.col, mesesACargar, 1);
      if (rango.getMergedRanges().length > 0) rango.breakApart();
      rango.merge().setValue(item.val).setVerticalAlignment('middle').setHorizontalAlignment('center').setFontFamily("Calibri").setFontSize(11);
      if (item.col === 2) rango.setNumberFormat("dd/MM/yyyy");
      else if (item.col === 5) rango.setFontWeight("bold");
    }
  });
  hojaPagos.getRange(filaInicioAbsoluta, 1, mesesACargar, 1).setNumberFormat("dd/MM/yyyy").setFontFamily("Calibri").setFontSize(11).setHorizontalAlignment("center");
  return true;
}

function encontrarUltimaFilaConFecha_(hojaPagos) {
  const colAValues = hojaPagos.getRange("A1:A" + hojaPagos.getMaxRows()).getValues();
  for (let i = colAValues.length - 1; i >= 0; i--) {
    if (colAValues[i][0] instanceof Date) return i + 1;
  }
  return -1;
}

function obtenerConfiguracionMensualidades(sheet) {
  const datosSettings = obtenerDatosConEncabezados(sheet);
  if (!datosSettings) return {};
  const config = {};
  datosSettings.data.forEach((fila) => {
    const nombre = fila["MENSUALIDAD"];
    const debeCargarse = fila["¿EL SCRIPT DEBE CARGAR ESTE TIPO DE MENSUALIDAD?"];
    if (nombre && debeCargarse && debeCargarse.toString().trim().toUpperCase() === 'SI') {
      config[nombre.toString().trim()] = {
        precioIndividual: fila["PRECIO INDIVIDUAL"],
        mesesEquivale: fila["¿POR CUANTOS MESES EQUIVALE?"],
        textoAMostrar: fila["TEXTO A MOSTRAR"]
      };
    }
  });
  return config;
}

function obtenerDatosPagos(sheet) {
  try {
    let headerRow = 2;
    const colAValues = sheet.getRange("A1:A10").getValues();
    const headerRowIndex = colAValues.findIndex(row => row[0] && row[0].toString().trim() === 'Fecha de Inicio');
    if (headerRowIndex !== -1) headerRow = headerRowIndex + 1;
    const lastRow = sheet.getLastRow();
    if (lastRow < headerRow) return { data: [], headerRow: headerRow };
    const data = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, 5).getValues();
    const headers = ["Fecha de Inicio", "Fecha de pago", "Importe", "Plan", "Texto a mostrar"];
    const jsonData = data.map(row => {
      let obj = {};
      headers.forEach((key, index) => { obj[key] = row[index]; });
      return obj;
    });
    return { data: jsonData, headerRow: headerRow };
  } catch (e) {
    Logger.log(`Error en obtenerDatosPagos: ${e.message}`);
    return null;
  }
}

function obtenerDatosConEncabezados(sheet) {
  try {
    const sheetName = sheet.getName();
    let headerRow;
    let headersArray;
    if (sheetName === "Control de usuarios") {
      headerRow = _encontrarFilaEncabezados(sheet);
      headersArray = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    } else if (sheetName === "Novedades") {
      headerRow = 2;
      headersArray = sheet.getRange("A2:G2").getValues()[0];
    } else if (sheetName === "Settings") {
      const data = sheet.getDataRange().getValues();
      let rowIndex = data.findIndex(row => row.join('').toUpperCase().includes("MENSUALIDAD"));
      if (rowIndex === -1) throw new Error(`No se encontró encabezado con "MENSUALIDAD" en 'Settings'.`);
      headerRow = rowIndex + 1;
      headersArray = data[rowIndex];
    } else {
      throw new Error(`La hoja "${sheetName}" no tiene una configuración definida.`);
    }
    const headersMap = {};
    headersArray.forEach((header, index) => {
      if (header) headersMap[header.toString().trim()] = index;
    });
    const lastRow = sheet.getLastRow();
    if (lastRow < headerRow) return { data: [], headers: headersMap, headerRow: headerRow };
    const dataValues = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, headersArray.length).getValues();
    const jsonData = dataValues.map(row => {
      const obj = {};
      for (const key in headersMap) { obj[key] = row[headersMap[key]]; }
      return obj;
    });
    return { data: jsonData, headers: headersMap, headerRow: headerRow };
  } catch (e) {
    Logger.log(`Error crítico en obtenerDatosConEncabezados para '${sheet.getName()}': ${e.toString()}`);
    throw new Error(`Error procesando '${sheet.getName()}': ${e.message}`);
  }
}

function _addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return d;
}

function procesarCreacionMasiva(listaDeArchivos) {
  let exitosos = 0;
  let fallaron = 0;
  const ID_CARPETA_DESTINO = '1nDfQOYrY_Hdg_VJu5_vXyS_RPV3jxU4k';
  const carpetaDestino = DriveApp.getFolderById(ID_CARPETA_DESTINO);
  for (const datos of listaDeArchivos) {
    try {
      const archivoPlantilla = DriveApp.getFileById(datos.programaId);
      const nuevoNombre = `${datos.alumno} - Rutina`;
      const copiaArchivo = archivoPlantilla.makeCopy(nuevoNombre, carpetaDestino);
      const nuevoSpreadsheet = SpreadsheetApp.openById(copiaArchivo.getId());
      const hojaEntrenamiento = nuevoSpreadsheet.getSheetByName("Entrenamiento");
      if (!hojaEntrenamiento) throw new Error('No se encontró la hoja "Entrenamiento".');
      hojaEntrenamiento.getRange("B3").setValue(datos.alumno);
      hojaEntrenamiento.getRange("B4").setValue(new Date(datos.fechaInicio));
      exitosos++;
    } catch (e) {
      Logger.log(`ERROR al crear archivo para ${datos.alumno}: ${e.message}`);
      fallaron++;
    }
  }
  return `Proceso completado. Archivos creados: ${exitosos}. Fallos: ${fallaron}.`;
}

function doPost(e) {
  const SECRET_KEY = "r3uN2k9pQ7xLz_5Hh1Vb0mZ8sT4aY6cD";
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET_KEY) {
      return ContentService.createTextOutput(JSON.stringify({
        "success": false,
        "error": "No autorizado: Secret incorrecto"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    const resultado = procesarAccionPanel(data);
    return ContentService.createTextOutput(JSON.stringify({
      "success": true,
      "mensaje": resultado,
      "alumnoId": data.alumnoId,
      "accion": data.accion
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      "success": false,
      "error": err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function sincronizarCorreosSecundaria() {
  const ssMaestra = SpreadsheetApp.getActiveSpreadsheet();
  const hojaControl = ssMaestra.getSheetByName(HOJA_CONTROL);
  const datos = hojaControl.getDataRange().getValues();
  const filaEncabezados = _encontrarFilaEncabezados(hojaControl);
  const datosExportar = [];
  for (let i = filaEncabezados; i < datos.length; i++) {
    const id = datos[i][0];
    const correo = datos[i][19];
    if (id && correo) datosExportar.push([correo.toString().trim().toLowerCase(), id]);
  }
  const ssSecundaria = SpreadsheetApp.openById(ID_HOJA_SECUNDARIA);
  const hojaSec = ssSecundaria.getSheets()[0];
  hojaSec.clearContents();
  hojaSec.appendRow(["Correo", "ID"]);
  if (datosExportar.length > 0) hojaSec.getRange(2, 1, datosExportar.length, 2).setValues(datosExportar);
}

function iniciarExtraccionEmails() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty('emailExtraccion_ultimaFila');
  const hojaControl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONTROL);
  const headerRow = _encontrarFilaEncabezados(hojaControl);
  const totalFilas = hojaControl.getLastRow() - headerRow;
  if (totalFilas > 0) hojaControl.getRange(headerRow + 1, 21, totalFilas, 2).clearContent();
  hojaControl.getRange(headerRow, 21).setValue("Email");
  hojaControl.getRange(headerRow, 22).setValue("Estado Email");
  properties.setProperty('emailExtraccion_ultimaFila', String(headerRow + 1));
  try {
    SpreadsheetApp.getUi().alert("Iniciando extracción de emails...\nEsto puede tardar varios minutos.");
  } catch (e) {}
  procesarLoteEmails();
}

function procesarLoteEmails() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  const startTime = new Date();
  const properties = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaControl = ss.getSheetByName(HOJA_CONTROL);
  const headerRow = _encontrarFilaEncabezados(hojaControl);
  const ultimaFila = hojaControl.getLastRow();
  let filaActual = parseInt(properties.getProperty('emailExtraccion_ultimaFila') || String(headerRow + 1));
  try {
    const numFilas = ultimaFila - headerRow;
    const datos = hojaControl.getRange(headerRow + 1, 1, numFilas, 22).getValues();
    while (filaActual <= ultimaFila) {
      if (new Date().getTime() - startTime.getTime() > TIEMPO_MAX_EJECUCION) {
        properties.setProperty('emailExtraccion_ultimaFila', String(filaActual));
        borrarTriggersAnteriores_('procesarLoteEmails');
        ScriptApp.newTrigger('procesarLoteEmails').timeBased().after(RETRASO_TRIGGER).create();
        return;
      }
      const indexDatos = filaActual - (headerRow + 1);
      const fila = datos[indexDatos];
      const id = fila ? fila[0] : null;
      const nombre = fila ? fila[1] : null;
      const estadoV = fila ? fila[21] : null;
      if (!id) { filaActual++; continue; }
      if (estadoV && estadoV.toString().trim().toLowerCase() === 'procesado') { filaActual++; continue; }
      try {
        const archivo = DriveApp.getFileById(id);
        const emails = new Set();
        archivo.getEditors().forEach(u => emails.add(u.getEmail()));
        archivo.getViewers().forEach(u => emails.add(u.getEmail()));
        const propietario = archivo.getOwner() ? archivo.getOwner().getEmail() : null;
        if (propietario) emails.delete(propietario);
        const listaEmails = [...emails].join(", ");
        hojaControl.getRange(filaActual, 21).setValue(listaEmails);
        hojaControl.getRange(filaActual, 22).setValue("Procesado");
      } catch (e) {
        hojaControl.getRange(filaActual, 21).setValue("ERROR: " + e.message);
        hojaControl.getRange(filaActual, 22).setValue("Error");
      }
      filaActual++;
    }
    properties.deleteProperty('emailExtraccion_ultimaFila');
    borrarTriggersAnteriores_('procesarLoteEmails');
    const totalFilasFinal = ultimaFila - headerRow;
    if (totalFilasFinal > 0) hojaControl.getRange(headerRow + 1, 22, totalFilasFinal, 1).clearContent();
    try {
      SpreadsheetApp.getUi().alert("✅ ¡Extracción finalizada!", "Los emails fueron depositados en la columna U.", SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {}
  } catch (e) {
    Logger.log(`ERROR CRÍTICO en procesarLoteEmails: ${e.message} ${e.stack}`);
  } finally {
    lock.releaseLock();
  }
}

function extraerFechasParaTest(e) {
  const TIEMPO_MAX       = 4.5 * 60 * 1000;
  const MAX_ALUMNOS_EXEC = 25;   // Mantenemos 25 para evitar el error 429
  const CHUNK_SIZE       = 10;   // Peticiones simultáneas
  const DELAY_MS         = 3000; // 3 segundos entre peticiones para no saturar la API
  const PROP_PROCESADOS  = 'extraer_totalProcesados';
  const TRIGGER_FUNCTION = 'extraerFechasParaTest';

  Logger.log("========== INICIO extraerFechasParaTest ==========");

  const properties = PropertiesService.getScriptProperties();
  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const hojaControl = ss.getSheetByName(HOJA_CONTROL);

  if (!hojaControl) {
    Logger.log("ERROR: No se encontró la hoja de control '" + HOJA_CONTROL + "'");
    return;
  }

  const headerRow   = _encontrarFilaEncabezados(hojaControl);
  const lastRow     = hojaControl.getLastRow();
  const numDataRows = lastRow - headerRow;
  
  if (numDataRows <= 0) {
    Logger.log("No hay filas de datos. Saliendo.");
    return;
  }

  const token    = ScriptApp.getOAuthToken();
  const BASE     = "https://sheets.googleapis.com/v4/spreadsheets/";
  const hdrs     = { Authorization: `Bearer ${token}` };
  const REGEX_ENT = /^entrenamiento(\d*)$/i;
  const COL_ID   = 0, COL_NOMBRE = 1, COL_T = 19; 

  const esPrimera  = properties.getProperty(PROP_PROCESADOS) === null;
  let totalProcesadosHistorico = parseInt(properties.getProperty(PROP_PROCESADOS) || '0');

  const numCols = Math.max(hojaControl.getLastColumn(), 20);
  const datos   = hojaControl.getRange(headerRow + 1, 1, numDataRows, numCols).getValues();

  const hojaTest = ss.getSheetByName("Control de pagos");
  if (!hojaTest) {
    throw new Error("No se encontró la hoja 'Test'.");
  }
  
  // Primera ejecución: limpiamos datos de la hoja Test desde la fila 2 hacia abajo, conservando encabezados
  if (esPrimera) {
    Logger.log("Primera ejecución: limpiando datos de la hoja Test (desde fila 2).");
    const lastRowTest = hojaTest.getLastRow();
    if (lastRowTest > 1) {
      hojaTest.getRange(2, 1, lastRowTest - 1, hojaTest.getLastColumn()).clearContent();
    }
    properties.setProperty(PROP_PROCESADOS, '0');
  }

  const alumnosAExtraer = [];
  datos.forEach((fila, i) => {
    const valT = (fila[COL_T] || "").toString().trim().toLowerCase();
    const tieneId = !!fila[COL_ID];
    if (tieneId && valT === "si") {
      alumnosAExtraer.push({
        id:        fila[COL_ID].toString().trim(),
        nombre:    fila[COL_NOMBRE].toString().trim(),
        rowIndex:  headerRow + 1 + i 
      });
    }
  });

  if (alumnosAExtraer.length === 0) {
    Logger.log("No quedan alumnos con 'SI'. Finalizando.");
    _finalizarExtraccion_(properties, PROP_PROCESADOS, TRIGGER_FUNCTION, totalProcesadosHistorico);
    return;
  }

  const pendientes = alumnosAExtraer.slice(0, MAX_ALUMNOS_EXEC);
  Logger.log(`Procesando lote de ${pendientes.length} alumnos. Quedan ${alumnosAExtraer.length - pendientes.length} pendientes.`);

  const startTime = new Date().getTime();

  function fetchAllEnChunks_(requests, fase) {
    const resultados = [];
    for (let i = 0; i < requests.length; i += CHUNK_SIZE) {
      const chunk = requests.slice(i, i + CHUNK_SIZE);
      let chunkResp = null;
      let maxRetries = 3;

      for (let r = 0; r < maxRetries; r++) {
        try {
          chunkResp = UrlFetchApp.fetchAll(chunk);
          const rateLimited = chunkResp.some(resp => resp.getResponseCode() === 429 || resp.getResponseCode() === 500);
          
          if (rateLimited && r < maxRetries - 1) {
            Logger.log(`[${fase}] Cuota excedida (429/500). Reintentando chunk en ${4000 * (r+1)}ms...`);
            Utilities.sleep(4000 * (r + 1));
            continue; 
          }
          break; 
        } catch(err) {
          if (r < maxRetries - 1) {
            Utilities.sleep(4000 * (r + 1));
          } else {
            chunkResp = chunk.map(() => ({ getResponseCode: () => 500, getContentText: () => err.message }));
          }
        }
      }
      chunkResp.forEach(res => resultados.push(res));
      if (i + CHUNK_SIZE < requests.length) Utilities.sleep(DELAY_MS);
    }
    return resultados;
  }

  // ── FASE 1: metadata de hojas ──────────────────────────────────
  const fase1Requests = pendientes.map(a => ({
    url:                `${BASE}${a.id}?fields=sheets(properties(title))`,
    headers:            hdrs,
    muteHttpExceptions: true
  }));

  const resp1 = fetchAllEnChunks_(fase1Requests, "FASE1");
  
  const parciales = pendientes.map((a, i) => ({ 
    alumno: a, 
    sheetName: null, 
    tienePagos: false,
    result: null,
    fechaInicio: null,
    fechaPago: null
  }));
  
  const indicesConHojas = []; 

  resp1.forEach((resp, i) => {
    const code = resp.getResponseCode();
    const content = resp.getContentText();

    if (code !== 200) {
      parciales[i].result = `Error API F1 (${code})`;
      return;
    }
    try {
      const meta = JSON.parse(content);
      const todasLasHojas = (meta.sheets || []).map(s => s.properties.title);
      
      const candidatos = todasLasHojas
        .map(title => {
          const m = title.match(REGEX_ENT);
          return m ? { title, num: m[1] ? parseInt(m[1]) : -1 } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.num - a.num);

      parciales[i].tienePagos = todasLasHojas.some(t => t.toLowerCase() === 'pagos');

      if (candidatos.length) {
        parciales[i].sheetName = candidatos[0].title;
      } else {
        parciales[i].result = "No date"; 
      }
      
      if (parciales[i].sheetName || parciales[i].tienePagos) {
        indicesConHojas.push(i);
      }

      if (!parciales[i].tienePagos) {
        parciales[i].fechaInicio = "No existe hoja pagos";
        parciales[i].fechaPago = "No existe hoja pagos";
      }

    } catch(e) {
      parciales[i].result = "Error leyendo datos";
    }
  });

  // ── FASE 2: Extracción de filas 7, 10 y hoja Pagos ───────────
  if (indicesConHojas.length > 0) {
    const fase2Requests = indicesConHojas.map(origIdx => {
      const p = parciales[origIdx];
      let url = `${BASE}${p.alumno.id}?`;
      
      let ranges = [];
      if (p.sheetName) {
        ranges.push(`ranges=${encodeURIComponent(`'${p.sheetName}'!7:7`)}`);
        ranges.push(`ranges=${encodeURIComponent(`'${p.sheetName}'!10:10`)}`);
      }
      if (p.tienePagos) {
        ranges.push(`ranges=${encodeURIComponent(`'Pagos'!A:B`)}`);
      }
      
      url += ranges.join('&');
      url += `&fields=sheets(properties(title),data(columnMetadata(hiddenByUser),rowData(values(effectiveValue,formattedValue,effectiveFormat(numberFormat(type))))))&includeGridData=true`;
      
      return { url, headers: hdrs, muteHttpExceptions: true };
    });

    const resp2 = fetchAllEnChunks_(fase2Requests, "FASE2");

    const extraerValorCelda = (cell) => {
      if (!cell) return null;
      const numType = cell?.effectiveFormat?.numberFormat?.type;
      const numVal  = cell?.effectiveValue?.numberValue;

      if ((numType === 'DATE' || numType === 'DATE_TIME') && numVal !== undefined) {
        const raw = new Date((numVal - 25569) * 86400000);
        return new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
      } else if (cell?.formattedValue && cell.formattedValue.toString().trim() !== "") {
        return cell.formattedValue;
      }
      return null;
    };

    resp2.forEach((resp, j) => {
      const origIdx = indicesConHojas[j];
      const p = parciales[origIdx];
      const code    = resp.getResponseCode();
      const content = resp.getContentText();

      if (code !== 200) {
        p.result = `Error API F2 (${code})`;
        return;
      }

      try {
        const detail = JSON.parse(content);
        const sheetsArray = detail.sheets || [];

        // 1. PROCESAR ENTRENAMIENTO
        if (p.sheetName) {
          const sheetEnt = sheetsArray.find(s => s.properties.title === p.sheetName);
          if (sheetEnt && sheetEnt.data && sheetEnt.data.length >= 2) {
            const gridData7  = sheetEnt.data[0];
            const gridData10 = sheetEnt.data[1];

            const colMeta  = gridData7.columnMetadata || gridData10.columnMetadata || [];
            const cells7   = gridData7.rowData?.[0]?.values || [];
            const cells10  = gridData10.rowData?.[0]?.values || [];

            const maxCols = Math.max(cells10.length, colMeta.length);
            let countSeries = 0, colIndexSeries = -1;
            let countPeso = 0, colIndexPeso = -1;

            for (let i = 0; i < maxCols; i++) {
              const oculta = colMeta[i]?.hiddenByUser;
              if (oculta) continue; 

              const cell10 = cells10[i];
              const val10  = (cell10?.formattedValue || cell10?.effectiveValue?.stringValue || "").toString().trim().toLowerCase();
              
              if (val10 === "series") {
                countSeries++; colIndexSeries = i;
              } else if (val10 === "peso") {
                countPeso++; colIndexPeso = i;
              }
            }

            let resultadoFinal = null;
            const extraerFila7 = (index) => extraerValorCelda(cells7[index]);

            if (countSeries > 1) {
              resultadoFinal = "Multiple semanas visibles";
            } else if (countSeries === 1) {
              resultadoFinal = extraerFila7(colIndexSeries);
            }

            if (!resultadoFinal) {
              if (countPeso > 1) {
                resultadoFinal = "Multiple semanas visibles";
              } else if (countPeso === 1) {
                resultadoFinal = extraerFila7(colIndexPeso) || "No date";
              } else {
                resultadoFinal = "No se encontro un bloque de entrenamiento visible";
              }
            }
            p.result = resultadoFinal;
          }
        }

        // 2. PROCESAR PAGOS INDEPENDIENTES
        if (p.tienePagos) {
          const sheetPagos = sheetsArray.find(s => s.properties.title.toLowerCase() === 'pagos');
          if (sheetPagos && sheetPagos.data && sheetPagos.data[0] && sheetPagos.data[0].rowData) {
            const rowData = sheetPagos.data[0].rowData;
            let lastA = null;
            let lastB = null;
            
            for (let r = rowData.length - 1; r >= 0; r--) {
              const row = rowData[r];
              
              if (lastA === null && row.values && row.values[0]) {
                const cellA = row.values[0];
                if (cellA.effectiveValue || cellA.formattedValue) {
                  lastA = extraerValorCelda(cellA);
                }
              }
              
              if (lastB === null && row.values && row.values[1]) {
                const cellB = row.values[1];
                if (cellB.effectiveValue || cellB.formattedValue) {
                  lastB = extraerValorCelda(cellB);
                }
              }

              if (lastA !== null && lastB !== null) break;
            }
            p.fechaInicio = lastA || "";
            p.fechaPago = lastB || "";
          } else {
            p.fechaInicio = "Hoja Pagos vacía";
            p.fechaPago = "Hoja Pagos vacía";
          }
        }

      } catch(e) {
        p.result = p.result || "Error leyendo datos";
        p.fechaInicio = p.fechaInicio || "Error leyendo datos";
      }
    });
  }

  // ── Escritura en hoja Test y actualización a "Procesado" ────────
  const nuevasFilas = parciales.map(p => {
    const nombreLimpio = p.alumno.nombre.replace(/\s*-\s*Rutina\s*/i, "").trim();
    return [
      nombreLimpio, 
      p.result ?? "No date", 
      p.fechaInicio ?? "No existe hoja pagos", 
      p.fechaPago ?? "No existe hoja pagos"
    ];
  });

  if (nuevasFilas.length > 0) {
    // Garantizamos que como mínimo sea 1, para que (ultimaFilaTest + 1) sea mínimo la fila 2
    const ultimaFilaTest = Math.max(hojaTest.getLastRow(), 1); 
    const rangoDestino = hojaTest.getRange(ultimaFilaTest + 1, 1, nuevasFilas.length, 4);
    rangoDestino.setValues(nuevasFilas);
    
    // Método seguro: iteramos individualmente para no disparar el error de columnas de Google Sheets
    try {
      nuevasFilas.forEach((fila, idx) => {
        const filaReal = ultimaFilaTest + 1 + idx;
        if (fila[1] instanceof Date) hojaTest.getRange(filaReal, 2).setNumberFormat("dd/MM/yyyy");
        if (fila[2] instanceof Date) hojaTest.getRange(filaReal, 3).setNumberFormat("dd/MM/yyyy");
        if (fila[3] instanceof Date) hojaTest.getRange(filaReal, 4).setNumberFormat("dd/MM/yyyy");
      });
    } catch(e) {}
    
    // Método seguro: marcamos "Procesado" uno por uno
    pendientes.forEach(p => {
      hojaControl.getRange(p.rowIndex, 20).setValue("Procesado");
    });
    
    totalProcesadosHistorico += pendientes.length;
    properties.setProperty(PROP_PROCESADOS, totalProcesadosHistorico.toString());
  }

  // ── Continuar o finalizar ──────────────────────────────────────
  if (alumnosAExtraer.length > MAX_ALUMNOS_EXEC) {
    borrarTriggersAnteriores_(TRIGGER_FUNCTION);
    ScriptApp.newTrigger(TRIGGER_FUNCTION).timeBased().after(RETRASO_TRIGGER).create();
  } else {
    _finalizarExtraccion_(properties, PROP_PROCESADOS, TRIGGER_FUNCTION, totalProcesadosHistorico);
  }

  Logger.log("========== FIN extraerFechasParaTest ==========");
}

function _finalizarExtraccion_(properties, PROP_PROCESADOS, TRIGGER_FUNCTION, total) {
  properties.deleteProperty(PROP_PROCESADOS);
  borrarTriggersAnteriores_(TRIGGER_FUNCTION);
  try {
    SpreadsheetApp.getUi().alert(`✅ ¡Listo! Se procesaron ${total} alumnos en total.`);
  } catch(e) {}
}

function crearTriggerDiarioExtraerFechas() {
  const nombreFuncion = 'extraerFechasParaTest';
  
  // 1. Borramos cualquier trigger anterior de esta función para evitar que se duplique
  borrarTriggersAnteriores_(nombreFuncion);
  
  // 2. Creamos el nuevo trigger diario
  ScriptApp.newTrigger(nombreFuncion)
    .timeBased()
    .everyDays(1)       // Que se ejecute todos los días
    .atHour(3)          // Entre las 3:00 AM y las 4:00 AM
    .create();
    
  SpreadsheetApp.getUi().alert('✅ Trigger creado', 'La extracción de fechas se ejecutará todos los días alrededor de las 3:00 AM.', SpreadsheetApp.getUi().ButtonSet.OK);
}
