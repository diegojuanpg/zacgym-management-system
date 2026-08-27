// node --experimental-strip-types scripts/ingresos.test.mjs
import assert from "node:assert/strict";
import { filasDe, porMonto, semanasDe, totalesPorRubro } from "../src/lib/ingresos.ts";

// Enero, agosto y diciembre: los dos extremos del año y uno del medio, que es
// donde se nota si el mes se corre un lugar. Más un día del año anterior, que
// no tiene que entrar.
const datos = [
  { dia: "2026-01-05", rubro: "cuota", monto: 40000 },
  { dia: "2026-08-24", rubro: "cuota", monto: 40000 },
  { dia: "2026-08-24", rubro: "kiosco", monto: 1000 },
  { dia: "2026-08-30", rubro: "cobro", monto: 5000 },
  { dia: "2026-12-31", rubro: "cuota", monto: 20000 },
  { dia: "2025-08-24", rubro: "cuota", monto: 99999 },
];

const opciones = { modo: "mes", anio: "2026", cuantas: "12", semanas: [], semana: "2026-08-24" };

// --- Por mes: los doce, en orden, y los vacíos en cero.
const meses = filasDe(datos, opciones);
assert.equal(meses.length, 12);
assert.deepEqual(meses[0], { etiqueta: "Ene", cuota: 40000 });
assert.deepEqual(meses[1], { etiqueta: "Feb" }); // febrero cerrado: la barra va vacía, no se saltea
assert.deepEqual(meses[7], { etiqueta: "Ago", cuota: 40000, kiosco: 1000, cobro: 5000 });
assert.deepEqual(meses[11], { etiqueta: "Dic", cuota: 20000 });

// El año filtra: 2025 no aporta a 2026 ni al revés.
const meses2025 = filasDe(datos, { ...opciones, anio: "2025" });
assert.deepEqual(meses2025[7], { etiqueta: "Ago", cuota: 99999 });
assert.deepEqual(meses2025[0], { etiqueta: "Ene" });

// --- Por día: lunes a domingo de la semana pedida, con los días sin plata en cero.
const dias = filasDe(datos, { ...opciones, modo: "dia" });
assert.equal(dias.length, 7);
assert.deepEqual(dias[0], { etiqueta: "Lun", cuota: 40000, kiosco: 1000 }); // 24/8 es lunes
assert.deepEqual(dias[1], { etiqueta: "Mar" });
assert.deepEqual(dias[6], { etiqueta: "Dom", cobro: 5000 }); // 30/8

// --- Por semana: la lista es continua, sin saltearse las semanas sin ventas.
const semanas = semanasDe(
  [
    { dia: "2026-08-05", rubro: "cuota", monto: 1 }, // miércoles, semana del 03/08
    { dia: "2026-08-24", rubro: "cuota", monto: 1 },
  ],
  "2026-08-27",
);
assert.deepEqual(semanas, ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"]);
assert.deepEqual(semanasDe([], "2026-08-27"), []);

const porSemana = filasDe(datos, { ...opciones, modo: "semana", semanas, cuantas: "todas" });
assert.deepEqual(
  porSemana.map((f) => f.etiqueta),
  ["3/8", "10/8", "17/8", "24/8"],
);
assert.deepEqual(porSemana[3], { etiqueta: "24/8", cuota: 40000, kiosco: 1000, cobro: 5000 });
assert.deepEqual(porSemana[1], { etiqueta: "10/8" });

// "Últimas N" recorta por el final, que es lo reciente.
const ultimas2 = filasDe(datos, { ...opciones, modo: "semana", semanas, cuantas: "2" });
assert.deepEqual(
  ultimas2.map((f) => f.etiqueta),
  ["17/8", "24/8"],
);

// --- El orden del apilado: el que mas entra va primero, o sea abajo de la pila.
// "suplemento" no aparece en los datos a proposito: tiene que quedar en cero y
// no en undefined, o la resta del sort da NaN y el orden sale cualquier cosa.
const rubros = ["cobro", "cuota", "kiosco", "suplemento"];
const delAño = filasDe(datos, { ...opciones, modo: "mes" });
const totales = totalesPorRubro(delAño, rubros);
assert.deepEqual(totales, { cobro: 5000, cuota: 100000, kiosco: 1000, suplemento: 0 });

// Cuota es la que mas entra, asi que va primera: abajo de todo, apoyada en el eje.
assert.deepEqual(porMonto(rubros, totales), ["cuota", "cobro", "kiosco", "suplemento"]);

// Empate en cero: desempata el abecedario, para que el orden no baile entre vistas.
assert.deepEqual(
  porMonto(["zeta", "alfa", "beta"], { zeta: 0, alfa: 0, beta: 0 }),
  ["alfa", "beta", "zeta"],
);

console.log("ingresos ok");
