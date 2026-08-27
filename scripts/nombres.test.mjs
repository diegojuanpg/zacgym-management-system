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

// Todo en mayuscula no es valido: se baja y se sube la primera.
assert.equal(nombrePropio("MARIA"), "Maria");
assert.equal(nombrePropio("MARIA GUERRERO"), "Maria Guerrero");
assert.equal(nombrePropio("ÁNGEL MUÑOZ"), "Ángel Muñoz");
// Una sola palabra gritada dentro de un nombre bien escrito tambien.
assert.equal(nombrePropio("Maria GUERRERO"), "Maria Guerrero");

// La palabra mixta no se toca: es la que distingue un "McCarthy" de un grito.
assert.equal(nombrePropio("McCarthy"), "McCarthy");
assert.equal(nombrePropio("DiCarlo"), "DiCarlo");
assert.equal(nombrePropio("mcCarthy"), "McCarthy");

// El punto separa, asi las iniciales sobreviven en vez de quedar "J.p.".
assert.equal(nombrePropio("J.P."), "J.P.");

// Espacios de mas no rompen nada ni agregan mayusculas sueltas.
assert.equal(nombrePropio(""), "");
assert.equal(nombrePropio("ana  maria"), "Ana  Maria");

console.log("nombres ok");
