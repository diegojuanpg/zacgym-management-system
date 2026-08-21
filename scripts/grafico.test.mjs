import assert from "node:assert/strict";
import { serie, ventana, lunesDe, sumarDias } from "../src/lib/grafico.ts";

// 2026-08-20 es jueves.
const HOY = "2026-08-20";

assert.equal(lunesDe(HOY), "2026-08-17");
assert.equal(lunesDe("2026-08-17"), "2026-08-17");
assert.equal(lunesDe("2026-08-23"), "2026-08-17", "el domingo cae en la semana que arranca el lunes");
assert.equal(sumarDias("2026-02-28", 1), "2026-03-01");

assert.deepEqual(ventana("dia", "7", HOY), { desde: "2026-08-14", hasta: HOY });
assert.deepEqual(ventana("semana", "actual", HOY), { desde: "2026-08-17", hasta: HOY });
assert.deepEqual(ventana("semana", "pasada", HOY), { desde: "2026-08-10", hasta: "2026-08-15" });
assert.deepEqual(ventana("semana", "mes", HOY), { desde: "2026-07-27", hasta: HOY });
assert.deepEqual(ventana("dia", "cualquiera", HOY), ventana("dia", "7", HOY), "período desconocido cae en el primero");

const filas = [
  { dia: "2026-08-17", rubro: "mensualidad", monto: 50000 },
  { dia: "2026-08-17", rubro: "consumible", monto: 3500 },
  { dia: "2026-08-18", rubro: "mensualidad", monto: 45000 },
  { dia: "2026-08-16", rubro: "mensualidad", monto: 99999 }, // domingo
  { dia: "2026-08-13", rubro: "cobro", monto: 2000 },
  { dia: "2026-01-01", rubro: "mensualidad", monto: 777 }, // fuera de la ventana
];

const porDia = serie(filas, "dia", "7", HOY);
assert.deepEqual(
  porDia.map((p) => p.fecha),
  ["2026-08-14", "2026-08-15", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"],
  "seis puntos: siete días menos el domingo",
);
assert.equal(porDia[0].etiqueta, "14/08");
assert.equal(porDia[2].mensualidad, 50000);
assert.equal(porDia[2].consumible, 3500);
assert.equal(porDia[4].mensualidad, 0, "día sin ventas va en cero, no se saltea");
assert.ok(porDia.every((p) => p.fecha !== "2026-08-16"), "el domingo no se grafica");

const porSemana = serie(filas, "semana", "mes", HOY);
assert.deepEqual(porSemana.map((p) => p.fecha), ["2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17"]);
assert.equal(porSemana[3].mensualidad, 95000, "la semana suma sus días");
assert.equal(porSemana[2].cobro, 2000);
assert.equal(porSemana[2].mensualidad, 0, "la plata del domingo no entra ni en la semana");
assert.equal(porSemana[0].mensualidad, 0);

assert.equal(serie(filas, "semana", "actual", HOY).length, 1, "semana actual: un solo punto");

console.log("grafico ok");
