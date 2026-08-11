// ========= CONSTANTES GLOBALES =========
const SHEET_NAME_TRIGGERS = "Novedades";
const DB_FILE_ID = "1AJ7rleF-zHcBpKnV5UPbQe04ZABQOw3Kk8UOuxy9ryg";
const HOJA_TAREAS = "Lista de tareas";

// ===================================================================================
// ========================== MENÚ PERSONALIZADO Y DISPARADORES ======================
// ===================================================================================

/**
 * Crea un menú personalizado y restaura las fórmulas al abrir la hoja.
 * @OnlyCurrentDoc
 */
function onOpen() {
  // Primero, se asegura de que todas las fórmulas estén en su lugar de forma silenciosa.
  restaurarFormulasAlAbrir();
  
  // Luego, crea el menú personalizado como antes.
  SpreadsheetApp.getUi()
    .createMenu('Funciones')
    .addItem('Panel para modificar rutinas', 'abrirPanelDeAcciones')
    .addItem('Panel para añadir stock', 'abrirSidebarStock')
    .addToUi();
}


/**
 * Se ejecuta cuando un usuario edita una celda en la hoja de cálculo.
 * @param {Object} e The event object
 */
function handleEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();

  // Si la edición no es en la hoja "Novedades", no hace nada.
  if (sheet.getName() !== SHEET_NAME_TRIGGERS) return;

  const row = range.getRow();
  const col = range.getColumn();
 
  // --- FUNCIONALIDAD MODIFICADA ---
  // Verifica si la celda editada está en la columna de stock (D) y después de la fila 34.
  if (col === 4 && row >= 34) {
    // --- CAMBIO ---
    // En lugar de borrar, ahora establece la fecha y hora actual en la columna C.
    sheet.getRange(row, 3).setValue(new Date());
    return; // Detiene la ejecución para no interferir con el resto del script.
  }
  // --- FIN DE LA FUNCIONALIDAD MODIFICADA ---

  const editedCell = range.getA1Notation();
  const newValue = range.getValue();
  const lowerCaseValue = newValue.toString().toLowerCase().trim();

  // El resto de la lógica para los botones de acción.
  switch (editedCell) {
    case "R22":
      if (lowerCaseValue === "ingresar") {
        range.clearContent();
        crearTarea();
      }
      break;
    case "F18":
      if (lowerCaseValue === "añadir") {
        anadirAlumno();
      }
      break;
    case "F22":
      if (lowerCaseValue === "revise") {
        range.clearContent();
        controlDeCaja(sheet);
      }
      break;
    case "F32":
      if (lowerCaseValue === "revise") {
        range.clearContent();
        controlDeStock(sheet);
      }
      break;
// En la función handleEdit (línea ~84):
case "M22":
  if (lowerCaseValue === "ingresar") {
    range.clearContent();
    ingresarVentas(sheet); // Sigue pasando "sheet" para optimizar la ejecución desde el disparador.
  }
  break;
    case "M32":
      if (lowerCaseValue === "transferir datos") {
        range.clearContent();
        transferirVentasDB();
      }
      break;
  }
}
function restaurarFormulasAlAbrir() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const sheetNovedades = ss.getSheetByName("NOVEDADES");
    const sheetPrecios = ss.getSheetByName("Lista de precios");
    const sheetMenus = ss.getSheetByName("Menu desplegables");

    if (sheetNovedades) {
      sheetNovedades.getRange("B9").setFormula(`=IFERROR(SUM(FILTER(M34:M, L34:L="Efectivo", COUNTIF({'Lista de precios'!B4:B; 'Lista de precios'!X4:X}, J34:J))), 0)`);
      sheetNovedades.getRange("B12").setFormula(`=IFERROR(SUM(FILTER(M34:M, L34:L="Transferencia", COUNTIF({'Lista de precios'!B4:B; 'Lista de precios'!X4:X}, J34:J))), 0)`);
      sheetNovedades.getRange("B15").setFormula(`=SUM(B8:C13)`);
      sheetNovedades.getRange("D9").setFormula(`=IFERROR(SUM(FILTER(M34:M, L34:L="Efectivo", COUNTIF('Lista de precios'!E4:E, J34:J))), 0)`);
      sheetNovedades.getRange("D12").setFormula(`=IFERROR(SUM(FILTER(M34:M, L34:L="Transferencia", COUNTIF('Lista de precios'!E4:E, J34:J))), 0)`);
      sheetNovedades.getRange("D15").setFormula(`=SUM(D8:E13)`);
      sheetNovedades.getRange("C27").setFormula(`=MAX('Controles de caja'!A2:A)`);
      sheetNovedades.getRange("D27").setFormula(`=INDEX(Registro_de_caja[CAJA GRANDE],MATCH(C27,Registro_de_caja[FECHA Y HORA],0))`);
      sheetNovedades.getRange("F27").setFormula(`=INDEX(Registro_de_caja[CAJA CHICA],MATCH(C27,Registro_de_caja[FECHA Y HORA],0))`);
      sheetNovedades.getRange("F34").setFormula(`=MAP(B34:B, D34:D, LAMBDA(producto, stock_manual, IF(producto = "",, IFERROR(LET(StockSistema, VLOOKUP(producto, 'Menu desplegables'!I:K, 3, FALSE), diferencia, stock_manual - StockSistema, IF(diferencia = 0, "✅ OK", IF(diferencia > 0, "📈 Sobra " & diferencia, "📉 Falta " & ABS(diferencia)))), "Producto no encontrado"))))`);
      sheetNovedades.getRange("H24").setFormula(`=IF(I24 = "", "", IFERROR(
  VLOOKUP(I24, IMPORTRANGE("1AJ7rleF-zHcBpKnV5UPbQe04ZABQOw3Kk8UOuxy9ryg", "Promos!M2:N"), 2, FALSE),
  LET(
    rango_familia, QUERY(
      IMPORTRANGE("1AJ7rleF-zHcBpKnV5UPbQe04ZABQOw3Kk8UOuxy9ryg", "Promos!A2:K"),
      "SELECT Col2, Col3, Col4, Col5, Col6, Col7, Col8, Col9, Col10, Col11 WHERE Col2 = '"&I24&"' OR Col3 = '"&I24&"' OR Col4 = '"&I24&"' OR Col5 = '"&I24&"' OR Col6 = '"&I24&"' OR Col7 = '"&I24&"' OR Col8 = '"&I24&"' OR Col9 = '"&I24&"' OR Col10 = '"&I24&"' OR Col11 = '"&I24&"' LIMIT 1",
      0
    ),
    cantidad, COUNTA(rango_familia),
    IFS(
      cantidad < 3, "SIN PROMOCIÓN",
      cantidad = 3, "Promo Fliar x3",
      cantidad = 4, "Promo Fliar x4",
      cantidad >= 5, "Promo Fliar x5"
    )
  )
))`);
      // --- FÓRMULA AGREGADA ---
      sheetNovedades.getRange("M24").setFormula(`=ARRAYFORMULA(IFNA(VLOOKUP(J24:J29, {'Menu desplegables'!I2:I, 'Menu desplegables'!J2:J}, 2, FALSE)) * K24:K29)`);
    } else { throw new Error("No se encontró la hoja 'NOVEDADES'."); }

    if (sheetPrecios) {
      sheetPrecios.getRange("X4").setFormula(`=MAP(N4:N, P4:P, Q4:Q, R4:R, LAMBDA(n, p, q, r, IF(n="",, n & " " & p & " " & q & " " & r)))`);
    } else { throw new Error("No se encontró la hoja 'Lista de precios'."); }

    if (sheetMenus) {
      sheetMenus.getRange("A2").setFormula(`=QUERY(IMPORTRANGE("1AJ7rleF-zHcBpKnV5UPbQe04ZABQOw3Kk8UOuxy9ryg", "'Settings'!A2:A"), "select Col1 where Col1 is not null")`);
      sheetMenus.getRange("I2").setFormula(`=LET(lista1, FILTER('Lista de precios'!B4:B, 'Lista de precios'!B4:B <> ""), lista2, FILTER('Lista de precios'!E4:E, 'Lista de precios'!E4:E <> ""), lista3, FILTER('Lista de precios'!I4:I, 'Lista de precios'!I4:I <> ""), concatenados, FILTER('Lista de precios'!N4:N & " " & 'Lista de precios'!P4:P & " " & 'Lista de precios'!Q4:Q & " " & 'Lista de precios'!R4:R, 'Lista de precios'!N4:N <> ""), VSTACK(lista1, lista2, lista3, concatenados))`);
      sheetMenus.getRange("J2").setFormula(`=LET(tabla_b, FILTER({'Lista de precios'!B4:B, 'Lista de precios'!C4:C}, 'Lista de precios'!B4:B <> ""), tabla_e, FILTER({'Lista de precios'!E4:E, 'Lista de precios'!F4:F}, 'Lista de precios'!E4:E <> ""), tabla_i, FILTER({'Lista de precios'!I4:I, 'Lista de precios'!J4:J}, 'Lista de precios'!I4:I <> ""), tabla_x, FILTER({'Lista de precios'!X4:X, 'Lista de precios'!U4:U}, 'Lista de precios'!X4:X <> ""), tabla_maestra, VSTACK(tabla_b, tabla_e, tabla_i, tabla_x), rango_busqueda, FILTER(I2:I, I2:I <> ""), MAP(rango_busqueda, LAMBDA(item, IFNA(VLOOKUP(item, tabla_maestra, 2, FALSE), "No encontrado"))))`);
      sheetMenus.getRange("K2").setFormula(`=LET(tabla_b, FILTER({'Lista de precios'!B4:B, IF('Lista de precios'!B4:B<>"", 0, "")}, 'Lista de precios'!B4:B <> ""), tabla_e, FILTER({'Lista de precios'!E4:E, 'Lista de precios'!G4:G}, 'Lista de precios'!E4:E <> ""), tabla_i, FILTER({'Lista de precios'!I4:I, 'Lista de precios'!K4:K}, 'Lista de precios'!I4:I <> ""), tabla_x, FILTER({'Lista de precios'!X4:X, 'Lista de precios'!S4:S}, 'Lista de precios'!X4:X <> ""), tabla_maestra, VSTACK(tabla_b, tabla_e, tabla_i, tabla_x), rango_busqueda, FILTER(I2:I, I2:I <> ""), MAP(rango_busqueda, LAMBDA(item, IFNA(VLOOKUP(item, tabla_maestra, 2, FALSE), "Producto no encontrado"))))`);
      sheetMenus.getRange("N2").setFormula(`=QUERY({'Lista de precios'!E4:E; 'Lista de precios'!I4:I; 'Lista de precios'!X4:X}, "SELECT Col1 WHERE Col1 IS NOT NULL")`);
    } else { throw new Error("No se encontró la hoja 'Menu desplegables'."); }

    Logger.log("Fórmulas restauradas automáticamente al abrir/refrescar la hoja.");
  } catch (e) {
    Logger.log('Error al restaurar fórmulas automáticamente: ' + e.message);
  }
}
/**
 * Muestra el sidebar de HTML para añadir stock.
 */
function abrirSidebarStock() {
  const html = HtmlService.createHtmlOutputFromFile('SidebarHTML')
      .setTitle('Añadir Stock')
      .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Obtiene la lista de productos para el menú desplegable del sidebar.
 * Es llamada desde el HTML.
 */
function getProductList() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Menu desplegables");
    if (!sheet) return [];
    const range = sheet.getRange("N2:N");
    return range.getValues().flat().filter(String);
  } catch (e) {
    Logger.log(e);
    return [];
  }
}

/**
 * Recibe una lista de productos y cantidades para actualizar el stock.
 * Es llamada desde el HTML.
 * @param {Array<Object>} pendingUpdates - Un array de objetos, ej: [{product: 'Producto A', quantity: 15}]
 * @returns {String} - Un mensaje de resumen detallado de la operación.
 */
function updateStockLevels(pendingUpdates) {
  if (!pendingUpdates || pendingUpdates.length === 0) {
    return "No había productos para actualizar.";
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Lista de precios");
  if (!sheet) {
    return "Error: No se encontró la hoja 'Lista de precios'.";
  }

  const dataT1 = sheet.getRange("E4:G").getValues();
  const dataT2 = sheet.getRange("I4:K").getValues();
  const dataT3 = sheet.getRange("X4:S").getValues();
  
  let updatedCount = 0;
  let notFoundProducts = []; // Array para guardar los nombres de productos no encontrados

  pendingUpdates.forEach(item => {
    const productToAdd = item.product;
    const quantityToAdd = Number(item.quantity);
    let found = false;

    // Buscar en Tabla 1 (Productos: E, Stock: G)
    for (let i = 0; i < dataT1.length; i++) {
      if (dataT1[i][0] === productToAdd) {
        const currentStock = Number(dataT1[i][2]) || 0;
        sheet.getRange(i + 4, 7).setValue(currentStock + quantityToAdd); // G = col 7
        found = true;
        break;
      }
    }

    // Buscar en Tabla 2 (Productos: I, Stock: K)
    if (!found) {
      for (let i = 0; i < dataT2.length; i++) {
        if (dataT2[i][0] === productToAdd) {
          const currentStock = Number(dataT2[i][2]) || 0;
          sheet.getRange(i + 4, 11).setValue(currentStock + quantityToAdd); // K = col 11
          found = true;
          break;
        }
      }
    }

    // Buscar en Tabla 3 (Productos: X, Stock: S)
    if (!found) {
       for (let i = 0; i < dataT3.length; i++) {
        if (dataT3[i][0] === productToAdd) {
          const currentStock = Number(dataT3[i][2]) || 0;
          sheet.getRange(i + 4, 19).setValue(currentStock + quantityToAdd); // S = col 19
          found = true;
          break;
        }
      }
    }

    if (found) {
      updatedCount++;
    } else {
      notFoundProducts.push(productToAdd);
    }
  });

  // Construye el mensaje de resumen
  let message = `Operación completada.\n\n✅ Productos actualizados: ${updatedCount}.`;
  if (notFoundProducts.length > 0) {
    message += `\n\n❌ Productos no encontrados:\n- ${notFoundProducts.join('\n- ')}`;
  }
  
  return message;
}


// ===================================================================================
// ========================== OTRAS FUNCIONES Y AYUDANTES ============================
// ===================================================================================

function crearTarea() {
  const ui = SpreadsheetApp.getUi();
  const hojaOrigen = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_TRIGGERS);

  const nombre = hojaOrigen.getRange('O24').getValue();
  const peticion = hojaOrigen.getRange('O25').getValue();
  const estado = hojaOrigen.getRange('Q24').getValue();

  if (nombre.toString().trim() === '' || peticion.toString().trim() === '' || estado.toString().trim() === '') {
    ui.alert('Por favor, completa el Alumno (O24), la Tarea (O25) y el Estado (Q24) antes de continuar.');
    return;
  }

  try {
    const spreadsheetDestino = SpreadsheetApp.openById(DB_FILE_ID);
    const hojaDestino = spreadsheetDestino.getSheetByName(HOJA_TAREAS);
    if (!hojaDestino) {
      ui.alert(`Error: No se encontró la hoja "${HOJA_TAREAS}" en el archivo de destino.`);
      return;
    }
    const nuevaFila = [new Date(), nombre, peticion, '', estado];
    hojaDestino.appendRow(nuevaFila);
    hojaOrigen.getRange('O24:O25').clearContent();
    hojaOrigen.getRange('Q24').clearContent();
    SpreadsheetApp.getActiveSpreadsheet().toast('¡Tarea creada exitosamente!', 'ÉXITO', 5);
  } catch (error) {
    ui.alert(`No se pudo crear la tarea. Error: ${error.message}`);
  }
}

function controlDeCaja(sheet) {
  const now = new Date();
  sheet.getRange("C24").setValue(now);
  SpreadsheetApp.getActiveSpreadsheet().toast("Fecha y hora de caja registradas.", "Éxito", 5);
}

function controlDeStock(sheet) {
  const now = new Date();
  const lastRow = sheet.getLastRow();
  if (lastRow < 34) return;
  const range = sheet.getRange("C34:D" + lastRow);
  const values = range.getValues();
  let changesMade = false;

  for (let i = 0; i < values.length; i++) {
    const timestampCell = values[i][0];
    const stockCell = values[i][1];
    if (timestampCell === "" && stockCell !== "" && stockCell.toString().toLowerCase().trim() !== "nada") {
      values[i][0] = now;
      changesMade = true;
    }
  }
  if (changesMade) {
    range.setValues(values);
    SpreadsheetApp.getActiveSpreadsheet().toast("Control de stock revisado y fechado.", "Éxito", 5);
  }
}

function crearDisparadorDeEdicion() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'handleEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('handleEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  SpreadsheetApp.getUi().alert('¡Disparador de edición creado con éxito!');
}

// --- NUEVA FUNCIÓN AUXILIAR ---
/**
 * Parsea una cadena de texto de la columna "Notas" y suma los montos de los pagos parciales.
 * @param {string} notesString - El texto de la celda de notas.
 * @returns {number} - La suma de los pagos parciales encontrados.
 */
function _sumarPagosParciales(notesString) {
  if (!notesString || typeof notesString !== 'string' || notesString.trim() === '') {
    return 0;
  }
  const pagos = notesString.split('-');
  let totalPagado = 0;
  const regex = /PAGO PARCIAL:\s*([\d\.,]+)/i;

  pagos.forEach(pago => {
    const match = pago.match(regex);
    if (match && match[1]) {
      // Reemplaza la coma por un punto para asegurar que sea un número válido
      const monto = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(monto)) {
        totalPagado += monto;
      }
    }
  });
  return totalPagado;
}

function transferirVentasDB() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(SHEET_NAME_TRIGGERS);

  // --- INICIO: VERIFICACIÓN Y CIERRE DE TURNO ---
  try {
    const HOJA_CONTROL_HORARIOS = "control de horarios";
    const HEADER_NOMBRE = "Nombre y apellido";
    const HEADER_DNI = "DNI";
    
    const hojaControl = ss.getSheetByName(HOJA_CONTROL_HORARIOS);
    if (!hojaControl) {
      ui.alert('Error de Configuración', `No se encontró la hoja llamada "${HOJA_CONTROL_HORARIOS}".`, ui.ButtonSet.OK);
      return;
    }

    const response = ui.prompt('Verificación de Seguridad', 'Para continuar, por favor ingresa tu DNI:', ui.ButtonSet.OK_CANCEL);

    if (response.getSelectedButton() != ui.Button.OK || response.getResponseText().trim() === '') {
      ss.toast('Operación cancelada.');
      return;
    }
    const dniIngresado = response.getResponseText().trim();

    const encabezadosControl = hojaControl.getRange(1, 1, 1, hojaControl.getLastColumn()).getValues()[0];
    const indiceColNombre = encabezadosControl.indexOf(HEADER_NOMBRE);
    const indiceColDNI = encabezadosControl.indexOf(HEADER_DNI);

    if (indiceColNombre === -1 || indiceColDNI === -1) {
      ui.alert('Error de Configuración', `No se encontraron los encabezados "${HEADER_NOMBRE}" y/o "${HEADER_DNI}" en la hoja "${HOJA_CONTROL_HORARIOS}".`, ui.ButtonSet.OK);
      return;
    }

    const datosNombres = hojaControl.getRange(2, indiceColNombre + 1, hojaControl.getLastRow() - 1, 1).getValues().flat();
    const datosDNI = hojaControl.getRange(2, indiceColDNI + 1, hojaControl.getLastRow() - 1, 1).getValues().flat();
    
    let nombreEncontrado = null;
    const indiceDNIEncontrado = datosDNI.findIndex(dni => dni.toString().trim() === dniIngresado);

    if (indiceDNIEncontrado !== -1) {
      nombreEncontrado = datosNombres[indiceDNIEncontrado];
    }

    if (!nombreEncontrado) {
      ui.alert('Error', `El DNI "${dniIngresado}" no fue encontrado. La operación ha sido cancelada.`, ui.ButtonSet.OK);
      return;
    }

    // --- CORRECCIÓN --- La búsqueda de la tabla de turnos ahora usa 'hojaControl' y sus encabezados.
    const nombreNormalizado = nombreEncontrado.toString().trim().toLowerCase();
    const encabezadosNormalizados = encabezadosControl.map(h => h.toString().trim().toLowerCase());
    const indiceColumnaRegistro = encabezadosNormalizados.indexOf(nombreNormalizado);
    
    if (indiceColumnaRegistro === -1) {
      ui.alert('Error', `No se encontró una tabla de registro para "${nombreEncontrado}" en la hoja "${HOJA_CONTROL_HORARIOS}".`, ui.ButtonSet.OK);
      return;
    }
    
    const numeroColumnaInicio = indiceColumnaRegistro + 1;
    const numeroColumnaFin = numeroColumnaInicio + 1;
    const numeroColumnaTotal = numeroColumnaInicio + 2;

    // --- CORRECCIÓN --- Se usa 'hojaControl' para buscar el turno a cerrar.
    const rangoTurnos = hojaControl.getRange(3, numeroColumnaInicio, hojaControl.getLastRow() - 2, 2).getValues();
    let filaParaCerrar = -1;

    for (let i = rangoTurnos.length - 1; i >= 0; i--) {
      const horaInicio = rangoTurnos[i][0];
      const horaFin = rangoTurnos[i][1];
      if (horaInicio !== "" && horaFin === "") {
        filaParaCerrar = i + 3;
        break;
      }
    }

    if (filaParaCerrar !== -1) {
      const horaFinActual = new Date();
      // --- CORRECCIÓN --- Se usa 'hojaControl' para leer y escribir los datos del turno.
      const celdaInicio = hojaControl.getRange(filaParaCerrar, numeroColumnaInicio);
      const horaInicio = new Date(celdaInicio.getValue());
      
      const diferenciaMs = horaFinActual.getTime() - horaInicio.getTime();
      const horasDecimales = diferenciaMs / (1000 * 60 * 60);
      const horasRedondeadas = (Math.round(horasDecimales * 2) / 2).toFixed(2);

      hojaControl.getRange(filaParaCerrar, numeroColumnaFin).setValue(horaFinActual);
      hojaControl.getRange(filaParaCerrar, numeroColumnaTotal).setValue(horasRedondeadas);
      ss.toast(`Turno cerrado para ${nombreEncontrado}. Total: ${horasRedondeadas} hs.`);
    } else {
      ss.toast(`No se encontró un turno abierto para cerrar para ${nombreEncontrado}.`);
    }

  } catch (e) {
    ui.alert("Error en Cierre de Turno", `No se pudo completar la verificación. Error: ${e.message}`, ui.ButtonSet.OK);
    return; 
  }
  // --- FIN: VERIFICACIÓN Y CIERRE DE TURNO ---


  // --- INICIO: LÓGICA ORIGINAL DE TRANSFERENCIA DE VENTAS ---
  const controlSheet = ss.getSheetByName("Controles de caja");
  try {
    if (!controlSheet) throw new Error('La hoja "Controles de caja" no fue encontrada.');
    const fechaHora = sourceSheet.getRange("C24").getValue();
    if (fechaHora) {
      const cajaGrande = sourceSheet.getRange("D24").getValue();
      const cajaChica = sourceSheet.getRange("F24").getValue();
      const targetRow = controlSheet.getLastRow() + 1;
      controlSheet.getRange(targetRow, 1, 1, 3).setValues([[fechaHora, cajaGrande, cajaChica]]);
      sourceSheet.getRange("C24:F24").clearContent();
    }
  } catch (e) {
    ui.alert("Error en Control de Caja", `No se pudo transferir los datos. Error: ${e.message}`, ui.ButtonSet.OK);
    return;
  }

  const HEADER_ROW = 33;
  const lastDataRow = sourceSheet.getRange("H" + (HEADER_ROW + 1) + ":H").getValues().filter(String).length + HEADER_ROW;
  
  if (lastDataRow <= HEADER_ROW) {
    ui.alert("Información", "No hay datos de ventas para transferir.", ui.ButtonSet.OK);
    return;
  }

  const numDataRows = lastDataRow - HEADER_ROW;
  const salesData = sourceSheet.getRange(HEADER_ROW + 1, 8, numDataRows, 6).getValues();

  let normalSales = [];
  let debtPayments = [];
  let stockSummary = {}; 

  salesData.forEach(row => {
    const method = row[4] ? row[4].toString().trim() : "";
    if (method === "Efectivo DEUDA" || method === "Transferencia DEUDA") {
      debtPayments.push(row);
    } else {
      normalSales.push(row);
      
      const product = row[2];
      const quantity = row[3];
      if (product && quantity > 0) {
        stockSummary[product] = (stockSummary[product] || 0) + quantity;
      }
    }
  });

  if (Object.keys(stockSummary).length > 0) {
    updateStock(stockSummary);
  }

  let normalSalesCount = 0;
  let debtsUpdatedCount = 0;

  try {
    const destSS = SpreadsheetApp.openById(DB_FILE_ID);
    const destSheet = destSS.getSheetByName('Novedades');
    const destData = destSheet.getDataRange().getValues();

    if (normalSales.length > 0) {
      destSheet.getRange(destSheet.getLastRow() + 1, 1, normalSales.length, 6).setValues(normalSales);
      normalSalesCount = normalSales.length;
    }

    if (debtPayments.length > 0) {
      debtPayments.forEach(payment => {
        const [p_fecha, p_nombre, p_producto, p_cantidad, p_metodo, p_total] = payment;
        
        let matchingDebts = [];
        destData.forEach((row, index) => {
          const [d_fecha, d_nombre, d_producto, d_cantidad, d_metodo, d_total] = row;
          if (d_nombre === p_nombre && d_producto === p_producto && d_cantidad == p_cantidad && d_metodo === "DEBE") {
            matchingDebts.push({ data: row, index: index + 1 });
          }
        });

        if (matchingDebts.length > 0) {
          matchingDebts.sort((a, b) => new Date(a.data[0]) - new Date(b.data[0]));
          const oldestDebt = matchingDebts[0];
          const debtRowIndex = oldestDebt.index;
          const totalDebt = parseFloat(oldestDebt.data[5]);
          const currentNotes = oldestDebt.data[7] ? oldestDebt.data[7].toString() : "";
          
          const sumOfPreviousPayments = _sumarPagosParciales(currentNotes);
          const currentPaymentAmount = parseFloat(p_total);
          const newTotalPaid = sumOfPreviousPayments + currentPaymentAmount;
          
          if (newTotalPaid >= totalDebt) {
            const finalMethod = p_metodo.replace(" DEUDA", "");
            destSheet.getRange(debtRowIndex, 5).setValue(finalMethod);
            destSheet.getRange(debtRowIndex, 8).clearContent();
          } else {
            const paymentNote = `PAGO PARCIAL: ${currentPaymentAmount.toFixed(2)}, ${p_metodo.replace(" DEUDA", "")}`;
            const newNotes = currentNotes ? `${currentNotes}-${paymentNote}` : paymentNote;
            destSheet.getRange(debtRowIndex, 8).setValue(newNotes);
          }
          debtsUpdatedCount++;
        }
      });
    }

    sourceSheet.getRange(HEADER_ROW + 1, 8, numDataRows, 6).clearContent();
    
    let successMessage = "Operación completada.\n\n";
    if (normalSalesCount > 0) {
      successMessage += `✅ Se transfirieron ${normalSalesCount} registros de ventas.\n`;
    }
    if (debtsUpdatedCount > 0) {
      successMessage += `💰 Se actualizaron ${debtsUpdatedCount} deudas.`;
    }
    if (normalSalesCount === 0 && debtsUpdatedCount === 0) {
        successMessage = "No se realizaron nuevas transferencias ni actualizaciones de deudas."
    }
    ui.alert("Éxito", successMessage, ui.ButtonSet.OK);

  } catch (e) {
    ui.alert("Error de Conexión", `No se pudo procesar la transferencia. Error: ${e.message}`, ui.ButtonSet.OK);
  }
}

function anadirAlumno() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaActual = ss.getSheetByName(SHEET_NAME_TRIGGERS);
  const apellido = hojaActual.getRange('B20').getValue().toString().trim();
  const nombre = hojaActual.getRange('D20').getValue().toString().trim();

  if (!apellido || !nombre) {
    ui.alert('Faltan datos', 'Por favor, asegúrate de que las celdas B20 (Apellido) y D20 (Nombre) tengan contenido.', ui.ButtonSet.OK);
    return;
  }

  const nombreCompleto = `${toProperCase(apellido)}, ${toProperCase(nombre)}`;
  const nombreNormalizado = normalizeString(nombreCompleto);

  try {
    const ssDestino = SpreadsheetApp.openById(DB_FILE_ID);
    const hojaDestino = ssDestino.getSheetByName("Control de usuarios");
    if (!hojaDestino) {
      ui.alert('Error', 'La hoja "Control de usuarios" no fue encontrada.', ui.ButtonSet.OK);
      return;
    }

    const listadoActual = hojaDestino.getRange("B2:B").getValues().flat().filter(String);
    const listadoNormalizado = new Set(listadoActual.map(n => normalizeString(n)));

    if (listadoNormalizado.has(nombreNormalizado)) {
      ui.alert('Alumno Duplicado', `El alumno "${nombreCompleto}" ya existe en el listado.`, ui.ButtonSet.OK);
      hojaActual.getRange('F18').clearContent();
      return;
    }
    const respuesta = ui.alert('Confirmar Acción', `¿Estás seguro de que quieres añadir a "${nombreCompleto}"?`, ui.ButtonSet.YES_NO);
    if (respuesta == ui.Button.YES) {
      hojaDestino.appendRow([null, nombreCompleto]);
      hojaActual.getRange('B20:D20').clearContent();
      ui.alert('Éxito', `Se ha agregado "${nombreCompleto}" al listado de alumnos.`, ui.ButtonSet.OK);
    }
  } catch (e) {
    ui.alert('Error', `Ocurrió un error: ${e.message}`, ui.ButtonSet.OK);
  } finally {
    hojaActual.getRange('F18').clearContent();
  }
}

/**
 * Procesa las ventas registradas en el rango I24:M29 de la hoja "Novedades",
 * las transfiere al registro de ventas y limpia el área de entrada.
 * Funciona correctamente tanto con el disparador handleEdit como con un botón.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} [sheet] (Opcional) La hoja de cálculo, pasada por handleEdit.
 */
function ingresarVentas(sheet) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. DETERMINAR LA HOJA A UTILIZAR (Soluciona el error 'undefined')
  let sheetToUse = sheet;
  if (!sheetToUse) {
    sheetToUse = ss.getSheetByName(SHEET_NAME_TRIGGERS);
    if (!sheetToUse) {
      ui.alert("Error de Configuración", `No se encontró la hoja: "${SHEET_NAME_TRIGGERS}".`);
      return;
    }
  }

  // --- El resto del código usa 'sheetToUse' en lugar de 'sheet' ---
  
  // NUEVO BLOQUE DE CONFIRMACIÓN
  const mensajeConfirmacion = '¿Estas seguro que anotaste bien?\n¿Contaste el dinero?';
  const respuesta = ui.alert('Confirmar Ingreso', mensajeConfirmacion, ui.ButtonSet.YES_NO);

  if (respuesta != ui.Button.YES) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Operación cancelada por el usuario.');
    return;
  }
  // FIN DEL NUEVO BLOQUE

  const sourceRange = sheetToUse.getRange("I24:L29"); // Usa sheetToUse

  try {
    const salesData = sheetToUse.getRange("I24:M29").getValues(); // Usa sheetToUse
    const now = new Date();

    let salesToProcess = [];
    let debtPaymentsToCheck = [];
    let invalidDebtMessages = [];

    // 1. Separa ventas normales de pagos de deudas
    for (const row of salesData) {
      const producto = row[1];
      if (producto) {
        const saleRecord = [now, row[0], producto, row[2], row[3], row[4]];
        const metodo = row[3] ? row[3].toString().trim() : "";
        if (metodo === "Efectivo DEUDA" || metodo === "Transferencia DEUDA") {
          debtPaymentsToCheck.push(saleRecord);
        } else {
          salesToProcess.push(saleRecord);
        }
      }
    }

    // 2. Verifica los pagos de deudas si los hay
    if (debtPaymentsToCheck.length > 0) {
      const destSS = SpreadsheetApp.openById(DB_FILE_ID);
      const destSheet = destSS.getSheetByName('Novedades');
      const destData = destSheet.getDataRange().getValues();

      debtPaymentsToCheck.forEach(payment => {
        const [, p_nombre, p_producto, p_cantidad, , p_total] = payment;
        const debtExists = destData.some(dbRow => 
            dbRow[1] === p_nombre &&
            dbRow[2] === p_producto &&
            dbRow[3] == p_cantidad &&
            dbRow[5] == p_total &&
            dbRow[4] === "DEBE"
        );

        if (debtExists) {
          salesToProcess.push(payment);
        } else {
          invalidDebtMessages.push(`- ${p_nombre}: ${p_producto} por $${p_total}`);
        }
      });
    }

    // 3. Muestra alertas y procesa los datos válidos
    if (invalidDebtMessages.length > 0) {
      ui.alert("Deudas no encontradas", "Los siguientes pagos no se registraron porque no se encontró una deuda coincidente:\n" + invalidDebtMessages.join("\n"), ui.ButtonSet.OK);
    }

    if (salesToProcess.length > 0) {
      // Usa sheetToUse
      const lastRowInTable = sheetToUse.getRange("H34:H").getValues().filter(String).length + 33; 
      const startRowToPaste = Math.max(lastRowInTable + 1, 34);
      // Usa sheetToUse
      sheetToUse.getRange(startRowToPaste, 8, salesToProcess.length, 6).setValues(salesToProcess); 
      SpreadsheetApp.getActiveSpreadsheet().toast(`${salesToProcess.length} movimiento(s) procesado(s) correctamente.`, "Éxito", 5);
    } else if (invalidDebtMessages.length === 0) {
      SpreadsheetApp.getActiveSpreadsheet().toast("No se encontraron ventas para ingresar.", "Aviso", 5);
    }

  } catch (e) {
    ui.alert("Error", `Ocurrió un error durante la operación: ${e.message}`, ui.ButtonSet.OK);
  } finally {
    // LIMPIEZA GARANTIZADA
    sourceRange.clearContent();
  }
}
function updateStock(summary) {
  const pricesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Lista de precios");
  const productsE = pricesSheet.getRange("E4:E").getValues().flat();
  const stockG = pricesSheet.getRange("G4:G").getValues();
  const productsI = pricesSheet.getRange("I4:I").getValues().flat();
  const stockK = pricesSheet.getRange("K4:K").getValues();
  const productsX = pricesSheet.getRange("X4:X").getValues().flat();
  const stockS = pricesSheet.getRange("S4:S").getValues();
  for (const product in summary) {
    const quantitySold = summary[product];
    let index;
    index = productsE.indexOf(product);
    if (index !== -1) {
      stockG[index][0] -= quantitySold;
      continue;
    }
    index = productsI.indexOf(product);
    if (index !== -1) {
      stockK[index][0] -= quantitySold;
      continue;
    }
    index = productsX.indexOf(product);
    if (index !== -1) {
      stockS[index][0] -= quantitySold;
    }
  }
  pricesSheet.getRange("G4:G").setValues(stockG);
  pricesSheet.getRange("K4:K").setValues(stockK);
  pricesSheet.getRange("S4:S").setValues(stockS);
}

function toProperCase(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

function normalizeString(str) {
  if (!str) return "";
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}


/**
 * Verifica y actualiza el estado de un alumno a "Activo" en la hoja madre si es necesario.
 * Se ejecuta de forma silenciosa antes de cualquier otra acción del panel.
 * @param {string} alumnoId - El ID del archivo del alumno a verificar.
 */
function asegurarEstadoActivo_(alumnoId) {
  try {
    const dbSpreadsheet = SpreadsheetApp.openById(DB_FILE_ID);
    const hojaControl = dbSpreadsheet.getSheetByName("Control de usuarios");
    if (!hojaControl) {
      Logger.log("No se encontró la hoja 'Control de usuarios' para actualizar el estado.");
      return; // Termina la función si no encuentra la hoja.
    }

    // Encontrar la fila de encabezados y el mapa de columnas
    const headerRow = _encontrarFilaEncabezados(hojaControl);
    const cols = _obtenerMapaDeColumnas(hojaControl, headerRow);

    // Verificar si existen las columnas 'id' y 'estado'
    if (cols['id'] === undefined || cols['estado'] === undefined) {
      Logger.log("La hoja 'Control de usuarios' no tiene encabezados 'ID' o 'Estado'.");
      return;
    }

    // Obtener todos los IDs y encontrar la fila del alumno
    const ids = hojaControl.getRange(headerRow + 1, cols['id'] + 1, hojaControl.getLastRow() - headerRow).getValues().flat();
    const rowIndex = ids.findIndex(id => id.toString() === alumnoId.toString());

    // Si se encontró al alumno
    if (rowIndex !== -1) {
      const rowToUpdate = headerRow + 1 + rowIndex;
      const estadoCell = hojaControl.getRange(rowToUpdate, cols['estado'] + 1);
      const estadoActual = estadoCell.getValue().toString().trim();

      // Comprobar si el estado NO es "Activo" o "Activo."
      if (estadoActual.toLowerCase() !== "activo" && estadoActual.toLowerCase() !== "activo.") {
        estadoCell.setValue("Activo");
        Logger.log(`El estado del alumno con ID ${alumnoId} fue actualizado a "Activo".`);
      }
    } else {
      Logger.log(`No se encontró al alumno con ID ${alumnoId} para actualizar su estado.`);
    }
  } catch (e) {
    // Registra el error sin interrumpir la ejecución principal
    Logger.log(`Error en asegurarEstadoActivo_: ${e.message}`);
  }
}

// ==================================================================
// --- PANEL DE ACCIONES (ADAPTADO PARA NOVEDADES) ---
// ==================================================================

/**
 * Muestra el menú lateral (sidebar) en la interfaz de usuario.
 */
function abrirPanelDeAcciones() {
  const html = HtmlService.createHtmlOutputFromFile('PanelAcciones')
    .setTitle('Panel de Acciones')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Obtiene la lista de alumnos desde la Hoja Madre usando su ID.
 * Es llamada desde el HTML del panel.
 * @returns {Array<Object>} Un array de objetos, donde cada objeto tiene 'id' y 'nombre'.
 */
function obtenerAlumnosConId() {
  try {
    // CAMBIO CLAVE: Abre la Hoja Madre por su ID para leer los datos.
    const dbSpreadsheet = SpreadsheetApp.openById(DB_FILE_ID); 
    const hojaControl = dbSpreadsheet.getSheetByName("Control de usuarios");
    
    const filaEncabezados = _encontrarFilaEncabezados(hojaControl);
    const rangoDatos = hojaControl.getRange(filaEncabezados + 1, 1, hojaControl.getLastRow() - filaEncabezados, 2).getValues();
    
    const alumnos = rangoDatos
      .filter(fila => fila[0] && fila[1])
      .map(fila => ({ id: fila[0], nombre: fila[1] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
      
    return alumnos;
  } catch (e) {
    Logger.log(`Error en obtenerAlumnosConId: ${e.message}`);
    return [];
  }
}


/**
 * Función central que recibe los datos del panel y ejecuta la acción correspondiente.
 * @param {Object} datos Un objeto con 'alumnoId' y 'accion'.
 * @returns {string} Un mensaje de éxito o error para mostrar al usuario.
 */
function procesarAccionPanel(datos) {
  const { alumnoId, accion } = datos;

  // --- LÍNEA AÑADIDA ---
  // Antes de hacer nada, nos aseguramos de que el alumno esté marcado como "Activo".
  asegurarEstadoActivo_(alumnoId);
  // --- FIN DE LA MODIFICACIÓN ---

  try {
    switch (accion) {
      case 'actualizar_rutina': return ejecutarActualizacionIndividual_(alumnoId, 0);
      case 'volver_1_semana': return ejecutarActualizacionIndividual_(alumnoId, 1);
      case 'volver_2_semanas': return ejecutarActualizacionIndividual_(alumnoId, 2);
      case 'volver_3_semanas': return ejecutarActualizacionIndividual_(alumnoId, 3);
      case 'ausencia_larga': return ejecutarProtocoloAusencia_(alumnoId);
      case 'crear_boton':
        const exitoBoton = aplicarFormatoBoton(alumnoId);
        return exitoBoton ? "Botón creado o actualizado exitosamente." : "Falló la creación del botón.";
      case 'cargar_rms': return ejecutarCargaRMsIndividual_(alumnoId);
      default: return "Acción no reconocida.";
    }
  } catch (e) {
    Logger.log(`ERROR FATAL en procesarAccionPanel: ${e.message} ${e.stack}`);
    return `Error: ${e.message}`;
  }
}

/**
 * Lógica para las acciones de actualizar rutina. Actualiza la info en la Hoja Madre.
 * @param {string} alumnoId - El ID del archivo del alumno.
 * @param {number} semanasAtras - Cuántas semanas retroceder.
 * @returns {string} Mensaje de resultado.
 */
function ejecutarActualizacionIndividual_(alumnoId, semanasAtras) {
    const lunesSemanaActual = calcularFechaObjetivo_("Semana actual");
    let fechaABuscar = semanasAtras === 0 ? new Date(lunesSemanaActual) : new Date(lunesSemanaActual.getTime() - (semanasAtras * 7 * 24 * 60 * 60 * 1000));
    const esRepetir = semanasAtras > 0;
    
    const resultado = procesarYExtraerEntrenamiento_(alumnoId, fechaABuscar, esRepetir, lunesSemanaActual);

    if (resultado.rutinaStatus === "Actualizada") {
        try {
            // CAMBIO CLAVE: Abre la Hoja Madre por su ID para escribir los datos.
            const dbSpreadsheet = SpreadsheetApp.openById(DB_FILE_ID);
            const hojaControl = dbSpreadsheet.getSheetByName("Control de usuarios");
            const headerRow = _encontrarFilaEncabezados(hojaControl);
            const cols = _obtenerMapaDeColumnas(hojaControl, headerRow);

            const ids = hojaControl.getRange(headerRow + 1, 1, hojaControl.getLastRow() - headerRow, 1).getValues().flat();
            const rowIndex = ids.findIndex(id => id === alumnoId);
            
            if (rowIndex !== -1) {
                const rowToUpdate = headerRow + 1 + rowIndex;
                const info = resultado.entrenamientoInfo;
                if (cols['fecha'] !== undefined) hojaControl.getRange(rowToUpdate, cols['fecha'] + 1).setValue(info.fecha);
                if (cols['semana'] !== undefined) hojaControl.getRange(rowToUpdate, cols['semana'] + 1).setValue(info.semana);
                if (cols['bloque'] !== undefined) hojaControl.getRange(rowToUpdate, cols['bloque'] + 1).setValue(info.bloque);
            }
        } catch(e) {
            Logger.log(`Error al actualizar "Control de usuarios": ${e.message}`);
        }
        return `Rutina actualizada al bloque: "${resultado.entrenamientoInfo.bloque}".`;
    } else {
        return `Error al actualizar: ${resultado.entrenamientoInfo.error}`;
    }
}


/**
 * Lógica para el protocolo de ausencia.
 * @param {string} alumnoId - El ID del archivo del alumno.
 * @returns {string} Mensaje de resultado.
 */
function ejecutarProtocoloAusencia_(alumnoId) {
    const ss = SpreadsheetApp.openById(alumnoId);
    const hojaEntrenamientoOriginal = encontrarHojaEntrenamiento_(ss);
    if (!hojaEntrenamientoOriginal) return "No se encontró la hoja de entrenamiento del alumno.";

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
    return `Se creó la hoja "${nuevoNombre}" y se ocultaron las originales.`;
}

/**
 * Lógica para la acción de cargar RMs de forma individual.
 * @param {string} alumnoId - El ID del archivo del alumno.
 * @returns {string} Mensaje de resultado.
 */
function ejecutarCargaRMsIndividual_(alumnoId) {
    const ss = SpreadsheetApp.openById(alumnoId);
    const hojaEntrenamiento = encontrarHojaEntrenamiento_(ss);
    const hojaProg1 = ss.getSheetByName("Prog1");
    if (!hojaEntrenamiento || !hojaProg1) return "El archivo no contiene 'Entrenamiento' o 'Prog1'.";

    const datosCompletos = hojaEntrenamiento.getDataRange().getValues();
    const filasClave = encontrarFilasClave_(datosCompletos);
    if (!filasClave) return "La estructura de la hoja no es válida.";

    const analisisGeneral = analizarEstructuraDeBloques_(hojaEntrenamiento, filasClave.headerRow);
    if (analisisGeneral.error) return `Error: ${analisisGeneral.error}`;
    
    let bloqueRMEncontrado = null;
    for (let i = analisisGeneral.visibleIndex; i >= 0; i--) {
        const bloqueActual = analisisGeneral.todos[i];
        const textoCelda1 = (datosCompletos[filasClave.headerRow - 2][bloqueActual.index] || '').toString().toUpperCase();
        const textoCelda2 = (datosCompletos[filasClave.headerRow - 3][bloqueActual.index] || '').toString().toUpperCase();

        if (textoCelda1.includes("RM") || textoCelda2.includes("RM")) {
            const endCol = (i + 1 < analisisGeneral.todos.length) ? analisisGeneral.todos[i + 1].index - 1 : hojaEntrenamiento.getLastColumn() - 1;
            bloqueRMEncontrado = { visible: { startCol: bloqueActual.index, endCol: endCol } };
            break;
        }
    }

    if (!bloqueRMEncontrado) return "No se encontró una semana de RM reciente.";
    
    cargarRMs_(hojaEntrenamiento, hojaProg1, datosCompletos, filasClave, bloqueRMEncontrado);
    return "Carga de RMs ejecutada exitosamente.";
}

// ==================================================================
// --- FUNCIONES DE SOPORTE PARA EL PANEL (COPIADAS DE HOJA MADRE) ---
// ==================================================================
/**
 * Aplica la secuencia de formato a un archivo de cliente específico,
 * con una lógica condicional basada en el contenido de la celda C2.
 * @param {string} fileId El ID del archivo del cliente.
 * @return {boolean} Devuelve true si tuvo éxito, false si falló.
 */
function aplicarFormatoBoton(fileId) {
  try {
    const ss = SpreadsheetApp.openById(fileId);
    const hojaObjetivo = encontrarHojaEntrenamiento_(ss);

    if (!hojaObjetivo) {
      Logger.log(`ERROR en archivo ID ${fileId}: No se encontró ninguna hoja 'Entrenamiento' o 'EntrenamientoX'.`);
      return false;
    }

    const valorC2 = hojaObjetivo.getRange('C2').getValue().toString().trim();
    
    const nuevaRegla = SpreadsheetApp.newDataValidation()
      .requireValueInList(['SI', 'NO', 'QUIERO REPETIR SEMANA'], true)
      .setAllowInvalid(false)
      .build();

    if (valorC2 === 'CASILLA DE ACTUALIZACIÓN') {
      hojaObjetivo.getRange('C2').setValue('¿Estas entrenado?');
      hojaObjetivo.getRange('C3:C4').setDataValidation(nuevaRegla);
      
    } else if (valorC2 !== '¿Estas entrenado?') {
      hojaObjetivo.getRange('C2:C7').breakApart();
      hojaObjetivo.getRange('C2').clearContent();
      hojaObjetivo.insertRowsAfter(4, 2);
      hojaObjetivo.getRange('A5:B6').setBackground('#ffffff');
      hojaObjetivo.getRange('C2:C9').setBackground('#ffffff');
      
      const celdaC2 = hojaObjetivo.getRange('C2');
      celdaC2.setValue('¿Estas entrenado?')
             .setFontFamily('Calibri').setFontSize(11).setFontWeight('bold')
             .setHorizontalAlignment('center').setVerticalAlignment('middle');
             
      const rangoC3C4 = hojaObjetivo.getRange('C3:C4');
      rangoC3C4.setDataValidation(nuevaRegla)
               .setFontFamily('Calibri').setFontSize(11).setFontWeight('bold')
               .setHorizontalAlignment('center').setVerticalAlignment('middle')
               .mergeVertically();
               
      const borderStyle = SpreadsheetApp.BorderStyle.SOLID_THIN;
      const blackColor = '#000000';
      celdaC2.setBorder(true, true, true, true, false, false, blackColor, borderStyle);
      rangoC3C4.setBorder(true, true, true, true, false, false, blackColor, borderStyle);

      hojaObjetivo.getRange('C5:C9').mergeVertically();
      hojaObjetivo.getRange('C2:C4').setBackground('#bfbfbf');
    }
    else {
        hojaObjetivo.getRange('C3:C4').setDataValidation(nuevaRegla);
    }

    Logger.log(`ÉXITO en archivo ID ${fileId}: Formato aplicado en la hoja '${hojaObjetivo.getName()}'.`);
    return true;

  } catch (e) {
    Logger.log(`FALLO al procesar archivo ID ${fileId}: ${e.message}`);
    return false;
  }
}

/**
 * Procesa una rutina, la actualiza y extrae la información relevante.
 */
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

    if (header !== 'SERIES' && header !== 'PESO') throw new Error("Estructura de encabezados sobre la fecha no es válida");
    
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
    Logger.log(`ERROR detallado en procesarYExtraerEntrenamiento_: ${e.message}`);
    return { rutinaStatus: "Fallo total", entrenamientoInfo: { error: e.message } };
  }
}

function encontrarHojaEntrenamiento_(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  // Expresión regular para buscar "Entrenamiento" seguido opcionalmente por números.
  // ^ y $ aseguran que no haya texto adicional antes o después.
  // i hace que no distinga entre mayúsculas y minúsculas.
  const regex = /^entrenamiento(\d*)$/i;

  const candidateSheets = sheets
    .map(sheet => {
      const match = sheet.getName().match(regex);
      if (match) {
        // match[1] captura los dígitos. Si no hay dígitos, es un string vacío.
        // Se le asigna -1 a las hojas sin número para que las que tienen número siempre tengan mayor prioridad.
        const num = match[1] ? parseInt(match[1], 10) : -1;
        return { sheet, num };
      }
      return null;
    })
    .filter(Boolean); // Elimina cualquier resultado nulo que no coincida.

  if (candidateSheets.length === 0) {
    return null;
  }

  // Ordena las hojas candidatas en orden descendente según su número.
  candidateSheets.sort((a, b) => b.num - a.num);

  // La primera hoja en la lista ordenada será la que tenga el número más alto.
  return candidateSheets[0].sheet;
}
function encontrarFilasClave_(datos) {
  for (let i = 0; i < datos.length; i++) {
    // Se añade normalizarTexto_ para compatibilidad
    if (datos[i] && datos[i][0] && normalizarTexto_(datos[i][0].toString()).toUpperCase() === 'DIA') {
      const headerRow = i + 1;
      return { headerRow, dateRow: headerRow - 3, weekRow: headerRow - 1, blockTitleRow: headerRow - 2 };
    }
  }
  return null;
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
      bloqueVisible = { startCol: colIndex, endCol: endCol };
      indiceVisible = i;
      break;
    }
  }
  if (!bloqueVisible) return { error: "No se encontró ningún bloque visible." };
  return { visible: bloqueVisible, visibleIndex: indiceVisible, todos: bloquesSeries };
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
      if (String(filaHeaders[i] || '').toUpperCase() === headerName && !cols.some(c => c.start === i+1) ) {
        cols.push({ start: i + 1 });
        break;
      }
    }
  });
  return cols;
}

function extraerDatosDelBloque_(datos, analisis, filasClave) {
  const titulo = extraerTitulo_(datos, analisis, filasClave.blockTitleRow - 1);
  const resultadoFecha = extraerFecha_(datos, analisis.visible, filasClave.headerRow - 1, filasClave.dateRow - 1);
  const semana = extraerSemana_(datos, analisis.visible, filasClave.weekRow - 1, resultadoFecha.columna);
  return { bloque: titulo, fecha: resultadoFecha.fecha, semana: semana };
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

function cargarRMs_(hojaEntrenamiento, hojaProg1, datos, filasClave, analisis) {
  const bloqueVisible = analisis.visible;
  const mapaColumnas = {};
  const encabezados = datos[filasClave.headerRow - 1].slice(bloqueVisible.startCol, bloqueVisible.endCol + 1);
  encabezados.forEach((h, i) => mapaColumnas[h.toString().toUpperCase().trim()] = i);

  if (mapaColumnas['SERIES'] === undefined || mapaColumnas['REPES'] === undefined || mapaColumnas['PESO'] === undefined) return;

  let rmsPorDia = {};
  for (let i = filasClave.headerRow; i < datos.length; i++) {
    const dia = datos[i][0] ? datos[i][0].toString().trim() : "";
    if (!dia) continue;
    if (datos[i][bloqueVisible.startCol + mapaColumnas['SERIES']] == 1 && datos[i][bloqueVisible.startCol + mapaColumnas['REPES']] == 1) {
      if (!rmsPorDia[dia]) rmsPorDia[dia] = [];
      rmsPorDia[dia].push({ peso: datos[i][bloqueVisible.startCol + mapaColumnas['PESO']], ejercicio: datos[i][2] });
    }
  }
  
  // Lógica completa de cargarRMs (Prog1 y Avances)
  const celdasProg1 = { "Lunes": { peso: "B8", ejercicio: "A1" }, "Martes": { peso: "B18", ejercicio: "A11" }, "Miércoles": { peso: "B28", ejercicio: "A21" }, "Jueves": { peso: "G8", ejercicio: "F1" }, "Viernes": { peso: "G18", ejercicio: "F11" }, "Sábado": { peso: "G28", ejercicio: "F21" } };
  for (const dia in rmsPorDia) { if (celdasProg1[dia]) { const rmInfo = rmsPorDia[dia][0]; const pesoNum = parseFloat(rmInfo.peso); if (!isNaN(pesoNum)) { const pesoRedondeado = Math.round(pesoNum / 2.5) * 2.5; const nombreEjercicio = rmInfo.ejercicio.replace(/\(Programa\)/i, "").trim().toUpperCase(); const textoPrograma = `PROGRAMA DE ${nombreEjercicio}`; hojaProg1.getRange(celdasProg1[dia].peso).setValue(pesoRedondeado); hojaProg1.getRange(celdasProg1[dia].ejercicio).setValue(textoPrograma); } } }
  try { const spreadsheet = hojaEntrenamiento.getParent(); const hojaAvances = spreadsheet.getSheetByName("Avances"); if (!hojaAvances) return; const normalizar = (texto) => texto.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); const fechaDelBloque = datos[filasClave.blockTitleRow - 2][analisis.visible.startCol]; if (!(fechaDelBloque instanceof Date)) return; const colCValues = hojaAvances.getRange("C1:C" + hojaAvances.getMaxRows()).getValues(); let filaDestino = -1; const fechaBusqueda = new Date(fechaDelBloque); fechaBusqueda.setHours(0, 0, 0, 0); for (let i = 0; i < colCValues.length; i++) { const celda = colCValues[i][0]; if (celda instanceof Date) { const fechaCelda = new Date(celda); fechaCelda.setHours(0, 0, 0, 0); if (fechaCelda.getTime() === fechaBusqueda.getTime()) { filaDestino = i + 1; break; } } } if (filaDestino === -1) { filaDestino = colCValues.findIndex(row => row[0] === "") + 1; if (filaDestino === 0) { filaDestino = hojaAvances.getLastRow() + 1; } hojaAvances.getRange(filaDestino, 3).setValue(fechaDelBloque); } const datosAvances = hojaAvances.getDataRange().getValues(); const filaEncabezadosIndex = datosAvances.findIndex(fila => fila.some(celda => celda.toString().trim() === "Fechas RM")); if (filaEncabezadosIndex === -1) return; const encabezadosAvances = datosAvances[filaEncabezadosIndex]; const mapaEncabezados = {}; encabezadosAvances.forEach((encabezado, i) => { if (encabezado) { mapaEncabezados[normalizar(encabezado)] = i + 1; } }); for (const dia in rmsPorDia) { const rmInfo = rmsPorDia[dia][0]; let nombreEjercicioNorm = normalizar(rmInfo.ejercicio.replace(/\(programa\)/i, "")); if (nombreEjercicioNorm.includes("peso muerto sumo")) { nombreEjercicioNorm = normalizar("Peso Muerto S"); } const columnaDestino = mapaEncabezados[nombreEjercicioNorm]; if (columnaDestino) { const pesoNum = parseFloat(rmInfo.peso); if (!isNaN(pesoNum)) { const pesoRedondeado = Math.round(pesoNum / 2.5) * 2.5; hojaAvances.getRange(filaDestino, columnaDestino).setValue(pesoRedondeado); } } } } catch (e) { Logger.log(`Error en Avances: ${e.message}`); }
}

function calcularFechaObjetivo_(modo) {
    const hoy = new Date();
    hoy.setHours(12, 0, 0, 0);
    let diaSemana = hoy.getDay();
    if (diaSemana === 0) diaSemana = 7;
    const lunesEstaSemana = new Date(hoy.getTime());
    lunesEstaSemana.setDate(hoy.getDate() - (diaSemana - 1));
    if (modo === "Semana que viene") {
        lunesEstaSemana.setDate(lunesEstaSemana.getDate() + 7);
    }
    return lunesEstaSemana;
}

function _encontrarFilaEncabezados(sheet) {
  const data = sheet.getRange("A1:A").getValues();
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim().toUpperCase() === 'ID') {
      return i + 1;
    }
  }
  throw new Error("No se pudo encontrar encabezado 'ID'");
}

function _obtenerMapaDeColumnas(sheet, headerRow) {
  const headers = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colMap = {};
  headers.forEach((header, index) => {
    if (header) {
      colMap[header.toString().trim().toLowerCase()] = index;
    }
  });
  return colMap;
}

// Función de ayuda necesaria para `encontrarFilasClave_`
function normalizarTexto_(texto) {
  if (!texto) return "";
  return texto
    .toString()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Inicia un turno registrando la fecha y hora de inicio para un usuario
 * identificado por su DNI. Busca las columnas de forma dinámica.
 */
function iniciarTurno() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // --- CONFIGURACIÓN ---
  const HOJA_CONTROL_HORARIOS = "control de horarios";
  const HEADER_NOMBRE = "Nombre y apellido";
  const HEADER_DNI = "DNI";
  
  const hojaControl = ss.getSheetByName(HOJA_CONTROL_HORARIOS);
  if (!hojaControl) {
    ui.alert('Error de Configuración', `No se encontró la hoja llamada "${HOJA_CONTROL_HORARIOS}".`, ui.ButtonSet.OK);
    return;
  }

  // 1. Pide al usuario que ingrese su DNI.
  const response = ui.prompt(
    '¿Quién esta iniciando el turno?',
    'Por favor, ingresa tu DNI:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() != ui.Button.OK || response.getResponseText().trim() === '') {
    ss.toast('Operación cancelada.');
    return;
  }
  const dniIngresado = response.getResponseText().trim();

  // 2. Busca dinámicamente las columnas de Nombre y DNI.
  const encabezadosControl = hojaControl.getRange(1, 1, 1, hojaControl.getLastColumn()).getValues()[0];
  const indiceColNombre = encabezadosControl.indexOf(HEADER_NOMBRE);
  const indiceColDNI = encabezadosControl.indexOf(HEADER_DNI);

  if (indiceColNombre === -1 || indiceColDNI === -1) {
    ui.alert('Error de Configuración', `No se encontraron los encabezados "${HEADER_NOMBRE}" y/o "${HEADER_DNI}" en la fila 1.`, ui.ButtonSet.OK);
    return;
  }

  // 3. Lee los datos y busca el nombre correspondiente al DNI.
  const datosNombres = hojaControl.getRange(2, indiceColNombre + 1, hojaControl.getLastRow() - 1, 1).getValues().flat();
  const datosDNI = hojaControl.getRange(2, indiceColDNI + 1, hojaControl.getLastRow() - 1, 1).getValues().flat();
  
  let nombreEncontrado = null;
  const indiceDNIEncontrado = datosDNI.findIndex(dni => dni.toString().trim() === dniIngresado);

  if (indiceDNIEncontrado !== -1) {
    nombreEncontrado = datosNombres[indiceDNIEncontrado];
  }

  if (!nombreEncontrado) {
    ui.alert('Error', `El DNI "${dniIngresado}" no fue encontrado en la lista.`, ui.ButtonSet.OK);
    return;
  }

  // 4. Busca la columna de la tabla de registro EN LA MISMA HOJA "control de horarios".
  // --- CORRECCIÓN --- Se usa 'encabezadosControl' que ya leímos, en lugar de los de la hoja activa.
  const nombreNormalizado = nombreEncontrado.toString().trim().toLowerCase();
  const encabezadosNormalizados = encabezadosControl.map(h => h.toString().trim().toLowerCase());
  const indiceColumnaRegistro = encabezadosNormalizados.indexOf(nombreNormalizado);
  
  if (indiceColumnaRegistro === -1) {
    ui.alert('Error', `No se encontró una tabla de registro para "${nombreEncontrado}" en la fila 1 de la hoja "${HOJA_CONTROL_HORARIOS}".`, ui.ButtonSet.OK);
    return;
  }
  const numeroColumnaInicio = indiceColumnaRegistro + 1;

  // 5. Busca la primera fila vacía y registra la hora de inicio.
  // --- CORRECCIÓN --- Se usa 'hojaControl' para buscar y escribir.
  const ultimaFilaConDatos = hojaControl.getRange(hojaControl.getMaxRows(), numeroColumnaInicio).getNextDataCell(SpreadsheetApp.Direction.UP).getRow();
  const filaParaEscribir = Math.max(3, ultimaFilaConDatos + 1);

  hojaControl.getRange(filaParaEscribir, numeroColumnaInicio).setValue(new Date());

  ss.toast(`Turno iniciado para ${nombreEncontrado}.`);
}
