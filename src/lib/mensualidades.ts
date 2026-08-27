/**
 * Qué mensualidad entra en la cuenta de lo que hay que replicar afuera.
 *
 * Cada mensualidad que entra hay que cargarla en dos lugares que no son esta
 * app: la planilla y la app con la que se manejan los pagos. Cuál falta se
 * filtra desde los encabezados de la tabla; acá vive lo que se equivoca solo
 * —el corte de fecha, la anulada a destiempo— y por eso se puede probar.
 */

/** El rubro del catálogo que hay que replicar afuera. */
export const MENSUALIDADES = "mensualidades";

/**
 * Desde cuándo se lleva la cuenta.
 *
 * Las 2708 mensualidades anteriores ya estaban cargadas cuando se hizo esto, y
 * meterlas en la cola la volvía inservible. Es una fecha fija y no una columna
 * porque se decide una sola vez, el día que arranca.
 */
export const DESDE_CARGA = Date.parse("2026-08-27T00:00:00-03:00");

/** Lo que hace falta mirar de una venta para saber si le falta carga. */
export interface CargaDeVenta {
  categoria: string | null;
  creado_en: string;
  anulada_en: string | null;
  cargada_sheet_en: string | null;
  cargada_app_en: string | null;
}

/**
 * Una mensualidad de las nuevas: es lo único que se replica afuera.
 *
 * La fecha se compara con `Date.parse` y no como texto: `creado_en` llega en UTC
 * y el corte está en hora Argentina, así que dos ISO distintos pueden ser el
 * mismo instante y compararlos como strings da cualquier cosa.
 */
export const esMensualidadNueva = (v: CargaDeVenta) =>
  v.categoria === MENSUALIDADES && Date.parse(v.creado_en) >= DESDE_CARGA;

/**
 * Anulada después de haberla cargado afuera: la planilla y la app quedaron con
 * un cobro que acá ya no existe, así que hay que ir a borrarlo. Destildando los
 * dos acuses vuelve a figurar como pendiente.
 *
 * La anulada que nunca se cargó no molesta a nadie: no llegó a salir de acá.
 */
export const hayQueDarDeBaja = (v: CargaDeVenta) =>
  esMensualidadNueva(v) &&
  v.anulada_en !== null &&
  (v.cargada_sheet_en !== null || v.cargada_app_en !== null);
