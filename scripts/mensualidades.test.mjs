// node --experimental-strip-types scripts/mensualidades.test.mjs
import assert from "node:assert/strict";
import {
  DESDE_CARGA,
  esMensualidadNueva,
  hayQueDarDeBaja,
} from "../src/lib/mensualidades.ts";

const nueva = "2026-08-28T15:00:00+00:00"; // despues del corte
const vieja = "2026-08-20T15:00:00+00:00"; // antes

const venta = (extra) => ({
  categoria: "mensualidades",
  creado_en: nueva,
  anulada_en: null,
  cargada_sheet_en: null,
  cargada_app_en: null,
  ...extra,
});

// --- Que entra en la cuenta.
assert.equal(esMensualidadNueva(venta({})), true);
assert.equal(esMensualidadNueva(venta({ creado_en: vieja })), false); // antes del corte
assert.equal(esMensualidadNueva(venta({ categoria: "consumibles" })), false);
assert.equal(esMensualidadNueva(venta({ categoria: null })), false);

// El corte es un instante, no un texto. Este ISO en UTC es el mismo momento que
// el corte en hora Argentina: comparado como string daria distinto.
assert.equal(Date.parse("2026-08-27T03:00:00+00:00"), DESDE_CARGA);
assert.equal(esMensualidadNueva(venta({ creado_en: "2026-08-27T03:00:00+00:00" })), true);
assert.equal(esMensualidadNueva(venta({ creado_en: "2026-08-27T02:59:59+00:00" })), false);

// --- Anuladas.
// Anulada sin haberse cargado: no llego a salir de acá, no molesta a nadie.
assert.equal(hayQueDarDeBaja(venta({ anulada_en: nueva })), false);

// Anulada despues de cargarla: hay que ir a borrarla del sheet y de la app.
assert.equal(
  hayQueDarDeBaja(venta({ anulada_en: nueva, cargada_sheet_en: nueva, cargada_app_en: nueva })),
  true,
);
// Cargada a medias y anulada: tambien, hay que sacarla del lugar donde entro.
assert.equal(hayQueDarDeBaja(venta({ anulada_en: nueva, cargada_app_en: nueva })), true);

// Una vieja no entra en la cuenta ni aunque se anule cargada.
assert.equal(
  hayQueDarDeBaja(venta({ creado_en: vieja, anulada_en: vieja, cargada_sheet_en: vieja })),
  false,
);

console.log("mensualidades ok");
