// node --experimental-strip-types scripts/filtros.test.mjs
import assert from "node:assert/strict";
import { rangoDe, comparador, lunes } from "../src/lib/filtros.ts";

assert.deepEqual(rangoDe("2026-08-01..2026-08-19"), { desde: "2026-08-01", hasta: "2026-08-19" });
assert.deepEqual(rangoDe("..12:00"), { desde: "", hasta: "12:00" });
assert.deepEqual(rangoDe("08:00.."), { desde: "08:00", hasta: "" });
assert.deepEqual(rangoDe(undefined), { desde: "", hasta: "" });

assert.equal(comparador(undefined), null);
assert.equal(comparador("mayor:"), null);
assert.equal(comparador("mayor:abc"), null);
assert.equal(comparador("entre:1000"), null); // sin el segundo valor no hay rango
assert.equal(comparador("otro:5"), null);

const mayor = comparador("mayor:5000");
assert.equal(mayor(5001), true);
assert.equal(mayor(5000), false);
assert.equal(mayor(null), false); // "—" no compite contra un número

const menor = comparador("menor:5000");
assert.equal(menor(4999), true);
assert.equal(menor(5000), false);

const igual = comparador("igual:5000");
assert.equal(igual(5000), true);
assert.equal(igual(-5000), false);

const entre = comparador("entre:1000:5000");
assert.equal(entre(1000), true);
assert.equal(entre(5000), true);
assert.equal(entre(999), false);

console.log("filtros ok");

// Las ventanas de Alumnos. Toda la semana del 24/8 mira al mismo lunes.
assert.equal(lunes("2026-08-24"), "2026-08-24"); // lunes
assert.equal(lunes("2026-08-25"), "2026-08-24"); // martes
assert.equal(lunes("2026-08-30"), "2026-08-24"); // domingo
assert.equal(lunes("2026-08-31"), "2026-08-31"); // el lunes siguiente ya es otra semana
assert.equal(lunes("2026-08-25", 1), "2026-08-17"); // la pasada
assert.equal(lunes("2026-08-25", -1), "2026-08-31"); // el que viene, tope de "vence esta semana"
assert.equal(lunes("2026-03-01", 1), "2026-02-16"); // cruzando fin de mes
assert.equal(lunes("2027-01-01", 1), "2026-12-21"); // cruzando fin de año
