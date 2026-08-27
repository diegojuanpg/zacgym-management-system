// node --experimental-strip-types scripts/mensualidades.test.mjs
import assert from "node:assert/strict";
import {
  DESDE_CARGA,
  estaCargada,
  esMensualidadNueva,
  hayQueDarDeBaja,
  pendienteDeCarga,
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

// --- Cargada es tener los dos.
assert.equal(estaCargada(venta({})), false);
assert.equal(estaCargada(venta({ cargada_sheet_en: nueva })), false);
assert.equal(estaCargada(venta({ cargada_app_en: nueva })), false);
assert.equal(estaCargada(venta({ cargada_sheet_en: nueva, cargada_app_en: nueva })), true);

// --- La cola: le falta al menos uno.
assert.equal(pendienteDeCarga(venta({})), true);
assert.equal(pendienteDeCarga(venta({ cargada_sheet_en: nueva })), true); // a medias
assert.equal(
  pendienteDeCarga(venta({ cargada_sheet_en: nueva, cargada_app_en: nueva })),
  false,
);
// Una vieja nunca entra, ni siquiera sin tildar.
assert.equal(pendienteDeCarga(venta({ creado_en: vieja })), false);

// --- Anuladas.
// Anulada sin haberse cargado: no llego a salir de acá, no molesta a nadie.
assert.equal(pendienteDeCarga(venta({ anulada_en: nueva })), false);
assert.equal(hayQueDarDeBaja(venta({ anulada_en: nueva })), false);

// Anulada despues de cargarla: hay que ir a borrarla del sheet y de la app.
const paraBajar = venta({ anulada_en: nueva, cargada_sheet_en: nueva, cargada_app_en: nueva });
assert.equal(hayQueDarDeBaja(paraBajar), true);
assert.equal(pendienteDeCarga(paraBajar), true); // sigue en la cola aunque este "cargada"

// Cargada a medias y anulada: tambien hay que ir a sacarla del lugar donde entro.
assert.equal(hayQueDarDeBaja(venta({ anulada_en: nueva, cargada_app_en: nueva })), true);

// Destildar los dos la saca de la cola: ya se borro afuera.
assert.equal(pendienteDeCarga(venta({ anulada_en: nueva })), false);

console.log("mensualidades ok");
