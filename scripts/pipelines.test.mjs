// node --experimental-strip-types scripts/pipelines.test.mjs
import assert from "node:assert/strict";
import { PIPELINES, estadoDe, cuantosMal } from "../src/lib/pipelines.ts";

const checkins = PIPELINES.find((p) => p.nombre === "SyncCheckins");
const ahora = Date.parse("2026-09-04T18:00:00Z");
const hace = (horas) => new Date(ahora - horas * 3600_000).toISOString();

const corrida = (fin, errores = 0, avisos = 0) => ({
  pipeline: "SyncCheckins",
  run_id: "r",
  inicio: fin,
  fin,
  errores,
  avisos,
  lineas: 1,
});

assert.equal(estadoDe(checkins, undefined, ahora), "sin_datos");
assert.equal(estadoDe(checkins, corrida(hace(1)), ahora), "ok");
assert.equal(estadoDe(checkins, corrida(hace(1), 0, 3), ahora), "avisos");
assert.equal(estadoDe(checkins, corrida(hace(1), 2), ahora), "error");
// Seis horas es la noche, todavía no es atraso; nueve sí.
assert.equal(estadoDe(checkins, corrida(hace(6)), ahora), "ok");
assert.equal(estadoDe(checkins, corrida(hace(9)), ahora), "atrasado");
// El que dejó de correr es atraso aunque su última corrida haya salido bien:
// del error avisa el mail de Apps Script, del silencio no avisa nadie.
assert.equal(estadoDe(checkins, corrida(hace(9), 5), ahora), "atrasado");

// El semanal aguanta una semana sin que sea atraso.
const rutinas = PIPELINES.find((p) => p.nombre === "UpdateAthleteProgram");
assert.equal(estadoDe(rutinas, corrida(hace(24 * 7)), ahora), "ok");
assert.equal(estadoDe(rutinas, corrida(hace(24 * 9)), ahora), "atrasado");

// Sin ninguna corrida no hay nada roto que contar: son siete "sin datos".
assert.equal(cuantosMal([], ahora), 0);
assert.equal(
  cuantosMal(
    PIPELINES.map((p) => ({ ...corrida(hace(1)), pipeline: p.nombre })),
    ahora,
  ),
  0,
);
assert.equal(
  cuantosMal(
    PIPELINES.map((p) => ({ ...corrida(hace(1), 1), pipeline: p.nombre })),
    ahora,
  ),
  PIPELINES.length,
);

console.log("pipelines ok");
