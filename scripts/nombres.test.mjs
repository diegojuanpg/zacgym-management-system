// node --experimental-strip-types scripts/nombres.test.mjs
import assert from "node:assert/strict";
import { nombrePropio } from "../src/lib/utils.ts";

// El caso de todos los dias: se carga apurado y en minuscula.
assert.equal(nombrePropio("diego guerrero"), "Diego Guerrero");
assert.equal(nombrePropio("guzman villarreal"), "Guzman Villarreal");
assert.equal(nombrePropio("maria jose"), "Maria Jose");

// Ya bien escrito no se toca.
assert.equal(nombrePropio("Diego Guerrero"), "Diego Guerrero");

// Acentos y eñes: la primera letra sube igual.
assert.equal(nombrePropio("ángel muñoz"), "Ángel Muñoz");

// Apostrofo y guion cuentan como separador.
assert.equal(nombrePropio("o'brien"), "O'Brien");
assert.equal(nombrePropio("jean-luc"), "Jean-Luc");

// El resto de la palabra queda como vino: bajarlo arreglaria un "MARIA" gritado
// pero romperia un "McCarthy", y no hay forma de distinguirlos.
assert.equal(nombrePropio("McCarthy"), "McCarthy");
assert.equal(nombrePropio("MARIA"), "MARIA");

// Espacios de mas no rompen nada ni agregan mayusculas sueltas.
assert.equal(nombrePropio(""), "");
assert.equal(nombrePropio("ana  maria"), "Ana  Maria");

console.log("nombres ok");
