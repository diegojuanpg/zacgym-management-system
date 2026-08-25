// node --experimental-strip-types scripts/filtros.test.mjs
import assert from "node:assert/strict";
import { rangoDe, comparador, lunesPasado } from "../src/lib/filtros.ts";

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

// La ventana de Alumnos: todos los dias de la semana del 24/8 miran al lunes 17.
assert.equal(lunesPasado("2026-08-24"), "2026-08-17"); // lunes
assert.equal(lunesPasado("2026-08-25"), "2026-08-17"); // martes
assert.equal(lunesPasado("2026-08-30"), "2026-08-17"); // domingo
assert.equal(lunesPasado("2026-08-31"), "2026-08-24"); // el lunes siguiente la corre entera
assert.equal(lunesPasado("2026-03-01"), "2026-02-16"); // cruzando fin de mes
assert.equal(lunesPasado("2027-01-01"), "2026-12-21"); // cruzando fin de año
