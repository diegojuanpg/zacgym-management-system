// node --experimental-strip-types scripts/caja.test.mjs
import assert from "node:assert/strict";
import { efectivoDelDia, saltosEntreTurnos } from "../src/lib/caja.ts";

const total = efectivoDelDia(
  [
    { metodo: "efectivo", caja: "grande", monto: 50000 },
    { metodo: "efectivo", caja: "chica", monto: 3000 },
    { metodo: "transferencia", caja: "grande", monto: 90000 }, // no pasó por el cajón
    { metodo: "no_paga", caja: "chica", monto: 1000 },
  ],
  [
    { metodo: "efectivo", caja: "grande", delta: -15000, anulado_en: null },
    { metodo: "efectivo", caja: "chica", delta: 17000, anulado_en: null },
    { metodo: "efectivo", caja: "grande", delta: 99999, anulado_en: "2026-08-19T10:00:00Z" },
    { metodo: "transferencia", caja: "chica", delta: 4000, anulado_en: null },
  ],
);
assert.deepEqual(total.ventas, { grande: 50000, chica: 3000 });
assert.deepEqual(total.movimientos, { grande: -15000, chica: 17000 });

assert.deepEqual(efectivoDelDia([], []), {
  ventas: { grande: 0, chica: 0 },
  movimientos: { grande: 0, chica: 0 },
});

const turno = (id, hora, inicial, final) => ({
  id,
  abierto_en: `2026-08-20T${hora}:00-03:00`,
  caja_grande_inicial: inicial,
  caja_chica_inicial: 0,
  caja_grande_final: final,
  caja_chica_final: final === null ? null : 0,
});

// Cierra con 100k, el siguiente abre declarando 105k: sobran 5k sin anotar.
const saltos = saltosEntreTurnos([
  turno("b", "14", 105000, 90000),
  turno("a", "07", 30000, 100000),
  turno("c", "20", 90000, null),
]);
assert.equal(saltos.size, 1);
assert.deepEqual(saltos.get("b"), { grande: 5000, chica: 0 });
assert.equal(saltos.has("a"), false); // el primero del día no tiene con qué comparar
assert.equal(saltos.has("c"), false); // abrió con lo mismo que contó el anterior

// El que sigue a un turno que nadie cerró no se compara contra la nada.
const sinCierre = saltosEntreTurnos([turno("a", "07", 30000, null), turno("b", "14", 105000, 0)]);
assert.equal(sinCierre.size, 0);

// Un solo turno, o ninguno, no genera saltos.
assert.equal(saltosEntreTurnos([turno("a", "07", 30000, 100000)]).size, 0);
assert.equal(saltosEntreTurnos([]).size, 0);

console.log("caja ok");
