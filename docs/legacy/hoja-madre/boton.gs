
/**
 * FUNCIÓN INICIAL: Se ejecuta desde el menú para comenzar el proceso.
 */
function iniciarVerificacion() {
  const ui = SpreadsheetApp.getUi();
  const respuesta = ui.alert(
    'Confirmar Verificación', 
    'Este proceso analizará las hojas de los clientes en segundo plano. Puede tardar varias ejecuciones en completarse.\n\n¿Deseas comenzar?', 
    ui.ButtonSet.YES_NO
  );

  if (respuesta !== ui.Button.YES) {
    return;
  }

  // Limpia cualquier proceso anterior y establece el punto de partida
  limpiarDisparadores();
  PropertiesService.getScriptProperties().setProperty('indiceVerificacion', '0'); // Empieza desde el primer usuario
  
  // Inicia el primer lote de procesamiento
  verificarCasillaDeActualizacionMasivo();
}

/**
 * FUNCIÓN DE CONTINUACIÓN: Es llamada por el disparador automático.
 */
function continuarVerificacion() {
  verificarCasillaDeActualizacionMasivo();
}

/**
 * FUNCIÓN PRINCIPAL DE TRABAJO: Procesa un lote de usuarios y se vuelve a llamar si es necesario.
 */
function verificarCasillaDeActualizacionMasivo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaControl = ss.getSheetByName('Control de usuarios');
  const scriptProperties = PropertiesService.getScriptProperties();

  if (!hojaControl) {
    Logger.log('Error: No se encontró la hoja "Control de usuarios".');
    return;
  }

  try {
    const HORA_INICIO = new Date();
    const LIMITE_TIEMPO_MS = 300000; // 5 minutos

    // Lee el progreso guardado
    let indiceActual = parseInt(scriptProperties.getProperty('indiceVerificacion'));
    if (isNaN(indiceActual)) {
      Logger.log("No se encontró un índice válido para continuar. Deteniendo proceso.");
      limpiarDisparadores();
      return;
    }
    
    const rangoClientes = hojaControl.getRange(3, 1, hojaControl.getLastRow() - 2, 15);
    const datosClientes = rangoClientes.getValues();
    
    let procesadosEnEsteLote = 0;

    // Bucle de procesamiento de lote
    for (let i = indiceActual; i < datosClientes.length; i++) {
      const tiempoTranscurrido = new Date() - HORA_INICIO;
      if (tiempoTranscurrido > LIMITE_TIEMPO_MS) {
        // Guarda el próximo índice y crea el siguiente relevo
        scriptProperties.setProperty('indiceVerificacion', i.toString());
        crearDisparador();
        Logger.log(`Límite de tiempo alcanzado. Próximo inicio en índice ${i}.`);
        return; // Termina esta ejecución
      }

      const fileId = datosClientes[i][0]; // Columna A
      const estadoActual = (datosClientes[i][14] || '').toString().trim(); // Columna O

      // AJUSTADO: Omite si no hay ID o si ya fue procesado con "Boton" o "Analizado".
      if (!fileId || estadoActual === 'Boton' || estadoActual === 'Analizado') {
        continue;
      }
      
      const tieneBoton = buscarCasillaEnUsuario(fileId);
      if (tieneBoton) {
        hojaControl.getRange(i + 3, 15).setValue('Boton');
      } else {
        hojaControl.getRange(i + 3, 15).setValue('Analizado');
      }
      procesadosEnEsteLote++;
    }

    // Si el bucle termina, es que se procesaron todos los clientes restantes
    limpiarDisparadores();
    scriptProperties.deleteProperty('indiceVerificacion');
    SpreadsheetApp.getUi().alert('Verificación Completada', `Proceso finalizado. Se han analizado todos los usuarios.`, SpreadsheetApp.getUi().ButtonSet.OK);
    Logger.log('Proceso de verificación completado.');

  } catch (e) {
    Logger.log(`Error en verificarCasillaDeActualizacionMasivo: ${e.message}`);
    limpiarDisparadores();
  }
}

/**
 * Busca la "CASILLA DE ACTUALIZACIÓN" en el archivo de un solo usuario.
 * @param {string} fileId El ID del archivo del cliente.
 * @return {boolean} Devuelve true si encuentra el texto, de lo contrario false.
 */
function buscarCasillaEnUsuario(fileId) {
  const TEXTO_A_BUSCAR = "CASILLA DE ACTUALIZACIÓN";
  try {
    const ss = SpreadsheetApp.openById(fileId);

    const sheetPrincipal = ss.getSheetByName('Entrenamiento');
    if (sheetPrincipal) {
      const valorC2 = sheetPrincipal.getRange('C2').getValue().toString().trim();
      if (valorC2 === TEXTO_A_BUSCAR) {
        return true;
      }
    }

    const todasLasHojas = ss.getSheets();
    let hojaMasAlta = null;
    let numeroMasAlto = -1;

    for (const hoja of todasLasHojas) {
      const nombreHoja = hoja.getName();
      const match = nombreHoja.match(/^Entrenamiento(\d+)$/i);
      if (match) {
        const numero = parseInt(match[1]);
        if (numero > numeroMasAlto) {
          numeroMasAlto = numero;
          hojaMasAlta = hoja;
        }
      }
    }

    if (hojaMasAlta) {
      const valorC2 = hojaMasAlta.getRange('C2').getValue().toString().trim();
      if (valorC2 === TEXTO_A_BUSCAR) {
        return true;
      }
    }
    
    return false;

  } catch (e) {
    Logger.log(`FALLO al procesar archivo ID ${fileId}: ${e.message}`);
    return false;
  }
}

/**
 * Crea un disparador para continuar la ejecución en 2 minutos.
 */
function crearDisparador() {
  limpiarDisparadores(); // Asegura que solo haya un disparador a la vez
  ScriptApp.newTrigger('continuarVerificacion')
      .timeBased()
      .after(2 * 60 * 1000) // 2 minutos
      .create();
}

/**
 * Elimina todos los disparadores de este script.
 */
function limpiarDisparadores() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'continuarVerificacion') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}
