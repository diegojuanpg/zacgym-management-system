// node --experimental-strip-types scripts/horas.test.mjs
import assert from "node:assert/strict";
import { horaDespuesDe, horaCercaDe, comoHora, duracion } from "../src/lib/horas.ts";

const el = (iso) => new Date(iso);
const hm = (d) => `${d.getDate()} ${comoHora(d.toISOString())}`;

// --- fin de turno: siempre despues del inicio
assert.equal(hm(horaDespuesDe("14:00", el("2026-08-20T07:00:00"))), "20 14:00");
// 22:00 -> 02:00 termina al otro dia
assert.equal(hm(horaDespuesDe("02:00", el("2026-08-20T22:00:00"))), "21 02:00");
// la misma hora exacta tambien cae al dia siguiente: un turno de cero no existe
assert.equal(hm(horaDespuesDe("07:00", el("2026-08-20T07:00:00"))), "21 07:00");

// --- inicio de turno: el mas cercano, para atras o adelante
// llega 7:05 y dice que arranco 7:00 -> hace cinco minutos, no en 23:55
assert.equal(hm(horaCercaDe("07:00", el("2026-08-20T07:05:00"))), "20 07:00");
// llega 6:50 para un turno que arranca 7:00 -> en diez minutos
assert.equal(hm(horaCercaDe("07:00", el("2026-08-20T06:50:00"))), "20 07:00");
// ficha 00:30 diciendo que arranco 22:00 -> ayer
assert.equal(hm(horaCercaDe("22:00", el("2026-08-20T00:30:00"))), "19 22:00");
// ficha 23:40 para un turno que arranca 00:10 -> manana
assert.equal(hm(horaCercaDe("00:10", el("2026-08-20T23:40:00"))), "21 00:10");

// --- duracion
assert.equal(duracion(el("2026-08-20T07:00:00"), el("2026-08-20T14:00:00")), "7 h");
assert.equal(duracion(el("2026-08-20T07:00:00"), el("2026-08-20T07:45:00")), "45 min");
assert.equal(duracion(el("2026-08-20T07:00:00"), el("2026-08-20T14:30:00")), "7 h 30 min");

console.log("horas ok");
