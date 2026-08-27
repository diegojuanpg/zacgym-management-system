/**
 * Arma la hoja "Dashboard" UNA SOLA VEZ (ejecutar buildDashboard desde el
 * editor). Todo lo que muestra son formulas de Sheets que se recalculan
 * solas cuando syncCheckins() agrega check-ins nuevos - no hace falta
 * volver a correr esto salvo que quieras rehacer el layout desde cero
 * (ojo: reconstruir pisa la semana elegida en el dropdown y el N de
 * semanas del grafico 2, vuelven a su default).
 *
 * Layout: 4 bloques en franjas de COLUMNAS separadas (no filas), cada uno
 * arranca en fila 1. Asi ningun bloque puede crecer verticalmente y pisar
 * a otro, sin importar cuantas semanas/dias/alumnos se acumulen.
 *
 *   Bloque 1 (col A):  Grafico "Check-Ins/Dia"
 *   Bloque 2 (col L):  Grafico "Check-Ins/Semana"
 *   Bloque 3 (col W):  KPI "Alumnos activos"
 *   Bloque 4 (col AB): Heatmap horarios (L a D, alumnos unicos, historico)
 */

const DASH = {
  HOUR_START: 7,
  HOUR_END: 23,
  MAX_WEEKS_CHART2: 104, // tope de filas reservadas para el grafico 2 (~2 anios)
  DEFAULT_N_WEEKS: 8,
  COL_BLOCK1: 1,   // A
  COL_BLOCK2: 12,  // L
  COL_BLOCK3: 23,  // W
  COL_BLOCK4: 28,  // AB
};

function buildDashboard() {
  ensureCheckinsHelperColumns_();
  const sheet = resetDashboardSheet_();

  writeChart1_(sheet);
  writeChart2_(sheet);
  writeKpi_(sheet);
  writeHeatmap_(sheet);

  sheet.hideColumns(DASH.COL_BLOCK1 + 9); // fuente del dropdown de semanas, no hace falta verla
  sheet.autoResizeColumns(1, 35);
}

// ---------- Columnas auxiliares en "Check-ins" (una vez, se reusan en todas las formulas) ----------

function ensureCheckinsHelperColumns_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('No existe la hoja "' + CONFIG.SHEET_NAME + '".');

  sheet.getRange('U1').setValue('DiaSolo');
  sheet.getRange('V1').setValue('LunesSemana');
  sheet.getRange('W1').setValue('Hora');

  sheet.getRange('U2').setFormula(
    "=ARRAYFORMULA(IF(B2:B=\"\",\"\", DATE(VALUE(LEFT(B2:B,4)),VALUE(MID(B2:B,6,2)),VALUE(MID(B2:B,9,2)))))"
  );
  sheet.getRange('V2').setFormula(
    "=ARRAYFORMULA(IF(B2:B=\"\",\"\", U2:U-WEEKDAY(U2:U,2)+1))"
  );
  sheet.getRange('W2').setFormula(
    "=ARRAYFORMULA(IF(B2:B=\"\",\"\", VALUE(MID(B2:B,12,2))))"
  );

  sheet.getRange('U2:V').setNumberFormat('dd/mm/yyyy');
}

function resetDashboardSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.DASHBOARD_SHEET_NAME);
  if (sheet) {
    sheet.clearConditionalFormatRules();
    sheet.clear();
    sheet.clearDataValidations();
    sheet.getCharts().forEach(function (c) { sheet.removeChart(c); });
  } else {
    sheet = ss.insertSheet(CONFIG.DASHBOARD_SHEET_NAME);
  }
  return sheet;
}

// ---------- Bloque 1: Check-Ins/Dia ----------

function writeChart1_(sheet) {
  const col = DASH.COL_BLOCK1;
  sheet.getRange(1, col).setValue('GRAFICO: CHECK-INS / DIA').setFontWeight('bold');

  // Fuente del dropdown (oculta, col+9): Actual, Pasada, + todas las semanas historicas (desc).
  const listCol = col + 9;
  sheet.getRange(1, listCol).setFormula(
    "={\"Actual\";\"Pasada\";SORT(UNIQUE(FILTER('Check-ins'!$V$2:$V,'Check-ins'!$V$2:$V<>\"\")),1,FALSE)}"
  );
  sheet.getRange(3, listCol, 1000, 1).setNumberFormat('dd/mm/yyyy');

  sheet.getRange(2, col).setValue('Semana:').setFontWeight('bold');
  const picker = sheet.getRange(2, col + 1);
  picker.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(sheet.getRange(1, listCol, 1000, 1), true).build()
  );
  picker.setValue('Actual');
  picker.setNumberFormat('dd/mm/yyyy');

  sheet.getRange(3, col).setValue('Lunes resuelto:');
  const pickerA1 = sheet.getRange(2, col + 1).getA1Notation();
  const resolved = sheet.getRange(3, col + 1);
  resolved.setFormula(
    "=IF(" + pickerA1 + "=\"Actual\", TODAY()-WEEKDAY(TODAY(),2)+1, IF(" + pickerA1 + "=\"Pasada\", TODAY()-WEEKDAY(TODAY(),2)+1-7, " + pickerA1 + "))"
  );
  resolved.setNumberFormat('dd/mm/yyyy');

  sheet.getRange(5, col, 1, 2).setValues([['Dia', 'Check-ins unicos']]).setFontWeight('bold');
  const bStartA1 = sheet.getRange(3, col + 1).getA1Notation();
  const anchorCol = bStartA1.replace(/\d+$/, '');
  // Categoria del eje = texto del tooltip al pasar el mouse (asi funciona el chart nativo de Sheets).
  sheet.getRange(6, col).setFormula(
    "=ARRAYFORMULA(LOWER(TEXT($" + anchorCol + "$3+{0;1;2;3;4;5;6},\"dddd\")) & \" \" & DAY($" + anchorCol + "$3+{0;1;2;3;4;5;6}) & \" de \" & LOWER(TEXT($" + anchorCol + "$3+{0;1;2;3;4;5;6},\"mmmm\")))"
  );
  const dayFormulas = [];
  for (let i = 0; i < 7; i++) {
    dayFormulas.push(["=COUNTUNIQUE(FILTER('Check-ins'!$E$2:$E,'Check-ins'!$U$2:$U=$" + bStartA1.replace(/\d+$/, '') + "$3+" + i + "))"]);
  }
  sheet.getRange(6, col + 1, 7, 1).setFormulas(dayFormulas);

  const chart = sheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sheet.getRange(5, col, 8, 1))
    .addRange(sheet.getRange(5, col + 1, 8, 1))
    .setPosition(1, col + 3, 0, 0)
    .setOption('title', 'Check-Ins/Dia')
    .setOption('curveType', 'function')
    .setOption('legend', { position: 'none' })
    .setOption('width', 700)
    .setOption('height', 300)
    .build();
  sheet.insertChart(chart);
}

// ---------- Bloque 2: Check-Ins/Semana ----------

function writeChart2_(sheet) {
  const col = DASH.COL_BLOCK2;
  sheet.getRange(1, col).setValue('GRAFICO: CHECK-INS / SEMANA').setFontWeight('bold');
  sheet.getRange(2, col).setValue('N semanas a mostrar:').setFontWeight('bold');
  const nCell = sheet.getRange(2, col + 1);
  nCell.setValue(DASH.DEFAULT_N_WEEKS);
  nCell.setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(1, DASH.MAX_WEEKS_CHART2).setAllowInvalid(true).build()
  );
  const nCellA1 = nCell.getA1Notation();

  sheet.getRange(4, col, 1, 2).setValues([['Semana del', 'Check-ins unicos']]).setFontWeight('bold');
  const dataStartRow = 5;
  // Texto ("dd/mm/yy"), no fecha real: si dejamos fecha, el grafico la trata como
  // eje continuo e interpola/agrega ticks entre las 3 fechas reales que hay.
  sheet.getRange(dataStartRow, col).setFormula(
    "=ARRAYFORMULA(TEXT(SORT(QUERY(SORT(UNIQUE(FILTER('Check-ins'!$V$2:$V,'Check-ins'!$V$2:$V<>\"\")),1,FALSE),\"select Col1 limit \"&$" + nCellA1.replace(/\d+$/, '') + "$2),1,TRUE),\"dd/mm/yy\"))"
  );

  const weekFormulas = [];
  const aColA1Prefix = sheet.getRange(dataStartRow, col).getA1Notation().replace(/\d+$/, '');
  for (let i = 0; i < DASH.MAX_WEEKS_CHART2; i++) {
    const r = dataStartRow + i;
    weekFormulas.push(["=IF($" + aColA1Prefix + "$" + r + "=\"\",\"\",COUNTUNIQUE(FILTER('Check-ins'!$E$2:$E,TEXT('Check-ins'!$V$2:$V,\"dd/mm/yy\")=$" + aColA1Prefix + "$" + r + ")))"]);
  }
  sheet.getRange(dataStartRow, col + 1, DASH.MAX_WEEKS_CHART2, 1).setFormulas(weekFormulas);

  const chart = sheet.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sheet.getRange(4, col, DASH.MAX_WEEKS_CHART2 + 1, 1))
    .addRange(sheet.getRange(4, col + 1, DASH.MAX_WEEKS_CHART2 + 1, 1))
    .setPosition(1, col + 3, 0, 0)
    .setOption('title', 'Check-Ins/Semana')
    .setOption('curveType', 'function')
    .setOption('legend', { position: 'none' })
    .setOption('width', 700)
    .setOption('height', 300)
    .build();
  sheet.insertChart(chart);
}

// ---------- Bloque 3: KPI Alumnos activos ----------

function writeKpi_(sheet) {
  const col = DASH.COL_BLOCK3;
  sheet.getRange(1, col).setValue('KPI: ALUMNOS ACTIVOS').setFontWeight('bold');
  sheet.getRange(2, col).setValue('Semana pasada').setFontWeight('bold');
  sheet.getRange(2, col + 1).setFormula(
    "=COUNTUNIQUE(FILTER('Check-ins'!$E$2:$E, 'Check-ins'!$V$2:$V=TODAY()-WEEKDAY(TODAY(),2)+1-7))"
  );
  sheet.getRange(3, col).setValue('Semana actual').setFontWeight('bold');
  sheet.getRange(3, col + 1).setFormula(
    "=COUNTUNIQUE(FILTER('Check-ins'!$E$2:$E, 'Check-ins'!$V$2:$V=TODAY()-WEEKDAY(TODAY(),2)+1))"
  );
  sheet.getRange(4, col).setValue('Variacion').setFontWeight('bold');
  const r2A1 = sheet.getRange(2, col + 1).getA1Notation();
  const r3A1 = sheet.getRange(3, col + 1).getA1Notation();
  sheet.getRange(4, col + 1).setFormula('=' + r3A1 + '-' + r2A1);
  sheet.getRange(5, col).setValue('Variacion %').setFontWeight('bold');
  const pct = sheet.getRange(5, col + 1);
  pct.setFormula("=IF(" + r2A1 + "=0,\"\",(" + r3A1 + "-" + r2A1 + ")/" + r2A1 + ")");
  pct.setNumberFormat('0.0%');
}

// ---------- Bloque 4: Heatmap horarios (L a D, alumnos unicos, historico completo) ----------

function writeHeatmap_(sheet) {
  const horaCol = DASH.COL_BLOCK4;
  sheet.getRange(1, horaCol).setValue('HEATMAP: HORARIOS PICO (alumnos unicos, historico completo)').setFontWeight('bold');
  sheet.getRange(2, horaCol, 1, 8).setValues([['Hora', 'L', 'M', 'X', 'J', 'V', 'S', 'D']]).setFontWeight('bold');

  const firstRow = 3;
  const hours = [];
  for (let h = DASH.HOUR_START; h <= DASH.HOUR_END; h++) hours.push(h);

  const hourLabels = hours.map(function (h) { return [h]; });
  sheet.getRange(firstRow, horaCol, hours.length, 1).setValues(hourLabels);

  const horaColA1 = sheet.getRange(firstRow, horaCol).getA1Notation().replace(/\d+$/, '');
  const formulas = hours.map(function (h, i) {
    const row = firstRow + i;
    const f = "=COUNTUNIQUE(FILTER('Check-ins'!$E$2:$E, 'Check-ins'!$W$2:$W=$" + horaColA1 + "$" + row + ", WEEKDAY('Check-ins'!$U$2:$U,2)=COLUMN()-" + horaCol + "))";
    return [f, f, f, f, f, f, f];
  });
  sheet.getRange(firstRow, horaCol + 1, hours.length, 7).setFormulas(formulas);

  const dataRange = sheet.getRange(firstRow, horaCol + 1, hours.length, 7);
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpoint('#ffffff')
    .setGradientMaxpoint('#d32f2f')
    .setRanges([dataRange])
    .build();
  sheet.setConditionalFormatRules([rule]);
}
