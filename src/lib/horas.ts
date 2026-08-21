/**
 * Un "HH:MM" no dice de qué día es. Estas dos deciden a qué momento real
 * corresponde, y la respuesta cambia según qué se esté cargando.
 *
 * El navegador del mostrador está en Buenos Aires, así que la hora local del
 * `Date` y la que ve quien carga son la misma.
 */

const DOCE_HORAS = 12 * 60 * 60 * 1000;

/** "HH:MM" de una fecha, para precargar el campo al editar. */
export function comoHora(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * "HH:MM" a la primera vez que esa hora cae después de la referencia. El que
 * entra a las 22 y sale a las 2 termina al otro día, no cuatro horas antes.
 *
 * Es la regla para un fin de turno: siempre va después de su inicio.
 */
export function horaDespuesDe(hhmm: string, referencia: Date) {
  const [h, m] = hhmm.split(":").map(Number);
  const cuando = new Date(referencia);
  cuando.setHours(h, m, 0, 0);
  if (cuando.getTime() <= referencia.getTime()) cuando.setDate(cuando.getDate() + 1);
  return cuando;
}

/**
 * "HH:MM" al momento más cercano a la referencia, para atrás o para adelante.
 *
 * Es la regla para el inicio de un turno, que puede ser anterior al check-in:
 * el que llega 7:05 y dice que arrancó a las 7 arrancó hace cinco minutos, no
 * dentro de veintitrés horas y cincuenta y cinco. Y el que ficha 00:30 diciendo
 * que arrancó 22:00 arrancó ayer, no esta noche.
 */
export function horaCercaDe(hhmm: string, referencia: Date) {
  const [h, m] = hhmm.split(":").map(Number);
  const cuando = new Date(referencia);
  cuando.setHours(h, m, 0, 0);
  if (cuando.getTime() - referencia.getTime() > DOCE_HORAS) cuando.setDate(cuando.getDate() - 1);
  else if (referencia.getTime() - cuando.getTime() > DOCE_HORAS) {
    cuando.setDate(cuando.getDate() + 1);
  }
  return cuando;
}

/** Cuánto hay entre dos momentos, para confirmar que se entendió bien. */
export function duracion(desde: Date, hasta: Date) {
  const minutos = Math.round((hasta.getTime() - desde.getTime()) / 60000);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}
