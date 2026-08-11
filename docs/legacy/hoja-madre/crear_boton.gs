// ============================================================================================
// --- FUNCIÓN PRINCIPAL Y ORQUESTADORA ---
// ============================================================================================

/**
 * Función principal que busca a los usuarios marcados, les aplica el formato y actualiza su estado.
 * Usa LockService, PropertiesService y triggers para un procesamiento masivo y robusto.
 * @param {Object} e El objeto de evento, que está presente si la función es ejecutada por un trigger.
 */
function crearBotonEntrenamientoMasivo(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    Logger.log('No se pudo obtener el bloqueo. Otra instancia del script ya se está ejecutando.');
    return;
  }

  // Detecta si la ejecución es por un trigger para suprimir las alertas de UI
  const isTriggered = e !== undefined;
  let ui = null; // Se declara aquí

  // SOLO se obtiene la UI si NO es un trigger
  if (!isTriggered) {
    ui = SpreadsheetApp.getUi();
  }

  try {
    const startTime = new Date();
    const timeLimitInMillis = 5 * 60 * 1000; // 5 minutos
    const properties = PropertiesService.getScriptProperties();
    const lastProcessedIndex = parseInt(properties.getProperty('lastProcessedIndex') || '-1');
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaControl = ss.getSheetByName('Control de usuarios');

    if (!hojaControl) {
      if (!isTriggered) ui.alert('Error', 'No se encontró la hoja "Control de usuarios".');
      Logger.log('Error: No se encontró la hoja "Control de usuarios".');
      return;
    }

    const rangoDatos = hojaControl.getRange(3, 1, hojaControl.getLastRow() - 2, 20);
    const datosClientes = rangoDatos.getValues();

    let usuariosParaFormatear = [];
    for (let i = 0; i < datosClientes.length; i++) {
      const fileId = datosClientes[i][0];
      const estadoBoton = (datosClientes[i][19] || '').toString().trim();
      if (fileId && estadoBoton === 'Crear boton') {
        usuariosParaFormatear.push({ id: fileId, originalIndex: i });
      }
    }

    if (usuariosParaFormatear.length === 0) {
      if (!isTriggered) ui.alert('Información', 'No se encontraron usuarios marcados con "Crear boton".');
      properties.deleteProperty('lastProcessedIndex');
      borrarTriggers_();
      return;
    }

    let exitosos = 0;
    let fallaron = 0;
    let processedInThisRun = 0;

    for (let i = 0; i < usuariosParaFormatear.length; i++) {
      const user = usuariosParaFormatear[i];
      
      if (user.originalIndex <= lastProcessedIndex) {
        continue;
      }
      
      if (new Date() - startTime >= timeLimitInMillis) {
        Logger.log('Se alcanzó el límite de tiempo. Guardando progreso y creando trigger.');
        rangoDatos.setValues(datosClientes); 
        properties.setProperty('lastProcessedIndex', user.originalIndex - 1);
        crearSiguienteTrigger_();
        
        if (!isTriggered) {
           ui.alert('Límite de Tiempo Alcanzado', `El script se detuvo después de 5 minutos. Se procesaron ${processedInThisRun} archivos.\n\nSe ha creado un disparador para continuar automáticamente en 2 minutos.`, ui.ButtonSet.OK);
        }
        return;
      }
      
      const resultado = aplicarFormatoBoton(user.id);
      if (resultado) {
        exitosos++;
        datosClientes[user.originalIndex][19] = 'Creado'; 
      } else {
        fallaron++;
        datosClientes[user.originalIndex][19] = 'Error';
      }
      processedInThisRun++;
    }

    Logger.log('Todos los archivos han sido procesados. Escribiendo cambios finales.');
    rangoDatos.setValues(datosClientes);
    properties.deleteProperty('lastProcessedIndex');
    borrarTriggers_();
    
    if (!isTriggered) {
      const mensajeFinal = `Proceso de formato completado.\n\n` +
                           `- Archivos formateados con éxito: ${exitosos}\n` +
                           `- Archivos con error: ${fallaron}`;
      ui.alert('Formato Finalizado', mensajeFinal, ui.ButtonSet.OK);
    }

  } finally {
    lock.releaseLock();
  }
}


// ============================================================================================
// --- MANEJO DE DISPARADORES (TRIGGERS) ---
// ============================================================================================

/**
 * Borra cualquier trigger existente para la función principal y crea uno nuevo.
 */
function crearSiguienteTrigger_() {
  borrarTriggers_();
  ScriptApp.newTrigger('crearBotonEntrenamientoMasivo')
    .timeBased()
    .after(2 * 60 * 1000) // 2 minutos
    .create();
  Logger.log('Se creó un nuevo trigger para ejecutarse en 2 minutos.');
}

/**
 * Función auxiliar para borrar todos los triggers asociados a la función principal.
 */
function borrarTriggers_() {
  const allTriggers = ScriptApp.getProjectTriggers();
  for (const trigger of allTriggers) {
    if (trigger.getHandlerFunction() === 'crearBotonEntrenamientoMasivo') {
      ScriptApp.deleteTrigger(trigger);
      Logger.log('Se borró un trigger existente.');
    }
  }
}


// ============================================================================================
// --- LÓGICA DE FORMATO Y AYUDANTES ---
// ============================================================================================

/**
 * Aplica la secuencia de formato a un archivo de cliente específico.
 * @param {string} fileId El ID del archivo del cliente.
 * @return {boolean} Devuelve true si tuvo éxito, false si falló.
 */
function aplicarFormatoBoton(fileId) {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const hojaObjetivo = encontrarHojaEntrenamiento_(ss);
    if (!hojaObjetivo) {
      Logger.log(`ERROR en archivo ID ${fileId}: No se encontró hoja de entrenamiento.`);
      return false;
    }
    const valorC2 = hojaObjetivo.getRange('C2').getValue().toString().trim();
    const nuevaRegla = SpreadsheetApp.newDataValidation()
      .requireValueInList(['SI', 'NO', 'QUIERO REPETIR SEMANA'], true)
      .setAllowInvalid(false)
      .build();
    if (valorC2 === 'CASILLA DE ACTUALIZACIÓN' || valorC2 === '¿Estas entrenando?' || valorC2 === '¿Estas entrenado?') {
      hojaObjetivo.getRange('C2').setValue('¿Estas entrenando?');
      hojaObjetivo.getRange('C3:C4').setDataValidation(nuevaRegla);
    } else {
      hojaObjetivo.getRange('C2:C7').breakApart();
      hojaObjetivo.getRange('C2').clearContent();
      hojaObjetivo.insertRowsAfter(4, 2);
      hojaObjetivo.getRange('A5:B6').setBackground('#ffffff');
      hojaObjetivo.getRange('C2:C9').setBackground('#ffffff');
      const celdaC2 = hojaObjetivo.getRange('C2');
      celdaC2.setValue('¿Estas entrenando?').setFontFamily('Calibri').setFontSize(11).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
      const rangoC3C4 = hojaObjetivo.getRange('C3:C4');
      rangoC3C4.setDataValidation(nuevaRegla).setFontFamily('Calibri').setFontSize(11).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
      rangoC3C4.mergeVertically();
      const borderStyle = SpreadsheetApp.BorderStyle.SOLID_THIN;
      const blackColor = '#000000';
      celdaC2.setBorder(true, true, true, true, false, false, blackColor, borderStyle);
      rangoC3C4.setBorder(true, true, true, true, false, false, blackColor, borderStyle);
      hojaObjetivo.getRange('C5:C9').mergeVertically();
      hojaObjetivo.getRange('C2:C4').setBackground('#bfbfbf');
    }
    Logger.log(`ÉXITO en archivo ID ${fileId}`);
    return true;
  } catch (e) {
    Logger.log(`FALLO FATAL en archivo ID ${fileId}: ${e.message}`);
    return false;
  }
}

/**
 * Encuentra la hoja de entrenamiento más reciente basándose en un número en el nombre.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet El libro de cálculo a revisar.
 * @return {GoogleAppsScript.Spreadsheet.Sheet | null} La hoja encontrada o null si no existe.
 */
function encontrarHojaEntrenamiento_(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  const regex = /^entrenamiento(\d*)$/i;
  const candidateSheets = sheets.map(sheet => {
    const match = sheet.getName().match(regex);
    if (match) {
      const num = match[1] ? parseInt(match[1], 10) : -1;
      return { sheet, num };
    }
    return null;
  }).filter(Boolean);
  if (candidateSheets.length === 0) return null;
  candidateSheets.sort((a, b) => b.num - a.num);
  return candidateSheets[0].sheet;
}
