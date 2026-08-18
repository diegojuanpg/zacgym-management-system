/**
 * Acentos de nombres y apellidos.
 *
 * La hoja se cargo a mano durante anios y la mitad de los nombres perdio la
 * tilde por el camino: conviven "Gomez" con "Gómez" y "Maria" con "María".
 * Este mapa dice como se escribe cada palabra, y lo usan las dos puntas: el
 * importador (para que reimportar el sheet no vuelva a ensuciar) y el SQL que
 * corrige lo que ya esta cargado.
 *
 *   node scripts/acentos.mjs --sql > acentos.sql
 *
 * Criterio: acentuacion del espaniol rioplatense. Los apellidos extranjeros se
 * dejan como estan (Webster, Scott, Schaefer, Niziolek, Paixao). Tampoco se
 * tocan los que la familia puede escribir de las dos formas (Mas/Más,
 * Peiro/Peiró, Sabate/Sabaté, Jodar/Jódar, Guiscafre/Guiscafré, Padros/Padrós,
 * Idigoras/Idígoras, Urpi/Urpí, Chane/Chané): sin saber cual usa cada uno,
 * corregirlos es inventar.
 */

/** palabra mal escrita -> como va. Se compara palabra por palabra, sensible a mayusculas. */
export const ACENTOS = {
  // Nombres
  Aaron: "Aarón", Adrian: "Adrián", Agustin: "Agustín", Aida: "Aída",
  Aleli: "Alelí", Ambar: "Ámbar", Analia: "Analía", Andres: "Andrés",
  Angel: "Ángel", Angeles: "Ángeles", Barbara: "Bárbara", Belen: "Belén",
  Benjamin: "Benjamín", Cesar: "César", Dario: "Darío", Elias: "Elías",
  Eloisa: "Eloísa", Estefania: "Estefanía", Fabian: "Fabián", Gaston: "Gastón",
  German: "Germán", Geronimo: "Gerónimo", Haydee: "Haydée", Hector: "Héctor",
  Ines: "Inés", Isaias: "Isaías", Jeronimo: "Jerónimo", Joaquin: "Joaquín",
  Jose: "José", Julian: "Julián", Lucia: "Lucía", Lujan: "Luján",
  Magali: "Magalí", Maria: "María", Martin: "Martín", Matias: "Matías",
  Maximo: "Máximo", Monica: "Mónica", Nestor: "Néstor", Nicolas: "Nicolás",
  Noemi: "Noemí", Oscar: "Óscar", Pia: "Pía", Raul: "Raúl", Rene: "René",
  Rocio: "Rocío", Rosalia: "Rosalía", Ruben: "Rubén", Saul: "Saúl",
  Sebastian: "Sebastián", Simon: "Simón", Sofia: "Sofía", Tobias: "Tobías",
  Tomas: "Tomás", Ursula: "Úrsula", Valentin: "Valentín", Veronica: "Verónica",
  Victor: "Víctor", Zenon: "Zenón",

  // Apellidos
  Albarracin: "Albarracín", Alvarez: "Álvarez", Antunez: "Antúnez",
  Aragon: "Aragón", Araoz: "Aráoz", Avila: "Ávila", Benitez: "Benítez",
  Brandan: "Brandán", Chavez: "Chávez", Cordoba: "Córdoba", Diaz: "Díaz",
  Dominguez: "Domínguez", Duran: "Durán", Estevez: "Estévez", Estofan: "Estofán",
  Farias: "Farías", Fernandez: "Fernández", Frias: "Frías", Galan: "Galán",
  Galvan: "Galván", Galvez: "Gálvez", Garcia: "García", Gimenez: "Giménez",
  Gomez: "Gómez", Gonzalez: "González", Guillen: "Guillén", Gutierrez: "Gutiérrez",
  Guzman: "Guzmán", Hernandez: "Hernández", Ibañez: "Ibáñez", Igarzabal: "Igarzábal",
  Jimenez: "Jiménez", Jofre: "Jofré", Juarez: "Juárez", Leon: "León",
  Lizarraga: "Lizárraga", Lopez: "López", Marin: "Marín", Marti: "Martí",
  Martinez: "Martínez", Melian: "Melián", Mendez: "Méndez", Meson: "Mesón",
  Monaco: "Mónaco", Nogues: "Nogués", Nougues: "Nougués", Nuñez: "Núñez",
  Paez: "Páez", Perdigon: "Perdigón", Perez: "Pérez", Ramirez: "Ramírez",
  Rodriguez: "Rodríguez", Roldan: "Roldán", Roman: "Román", Saenz: "Sáenz",
  Saez: "Sáez", Sanchez: "Sánchez", Santillan: "Santillán", Sola: "Solá",
  Solis: "Solís", Solorzano: "Solórzano", Suarez: "Suárez", Teran: "Terán",
  Vazquez: "Vázquez", Velez: "Vélez", Veliz: "Véliz", Veron: "Verón",
  Villardon: "Villardón", Ybañez: "Ybáñez", Zavalia: "Zavalía",

  // Mal escritas al reves: la tilde esta de mas.
  Dí: "Di", Lúcio: "Lucio", Ruíz: "Ruiz", Támara: "Tamara",

  // Mayusculas
  GarcíA: "García", jaramillo: "Jaramillo", lassalle: "Lassalle",
};

/** Corrige palabra por palabra. Lo que no esta en el mapa no se toca. */
export function corregir(texto) {
  return texto
    .split(/(\s+)/)
    .map((p) => ACENTOS[p] ?? p)
    .join("");
}

/**
 * Saca del nombre las notas que alguien dejo pegadas en la hoja: corazones,
 * "(nueva rutina)", "TENGO QUE PASAR LOS DATOS". Los parentesis que distinguen
 * personas —(Padre), (Hijo), (grande)— se quedan: ahi si dicen algo.
 */
export function limpiar(texto) {
  return texto
    .replace(/[\u2665\u2764]/g, "")
    .replace(/\(nueva[^)]*\)?/gi, "")
    .replace(/\bRutina\b/gi, "")
    .replace(/TENGO QUE PASAR LOS DATOS/i, "")
    .replace(/\s+/g, " ")
    .replace(/[-\s]+$/, "")
    .trim();
}

if (process.argv.includes("--sql")) {
  const filas = Object.entries(ACENTOS)
    .map(([mal, bien]) => `    (${q(mal)}, ${q(bien)})`)
    .join(",\n");
  console.log(`-- Generado por scripts/acentos.mjs --sql. No editar a mano.
-- Corrige palabra por palabra: los apellidos compuestos ("Ponce De Leon") se
-- arreglan solos sin tener que listar cada combinacion.
begin;

with mapa(mal, bien) as (
  values
${filas}
),
palabras as (
  select a.id,
         w.campo,
         w.orden,
         coalesce(m.bien, w.palabra) as palabra
    from public.alumnos a
    cross join lateral (
      select 'apellido' as campo, t.palabra, t.orden
        from unnest(regexp_split_to_array(a.apellido, ' ')) with ordinality as t(palabra, orden)
      union all
      select 'nombre', t.palabra, t.orden
        from unnest(regexp_split_to_array(a.nombre, ' ')) with ordinality as t(palabra, orden)
    ) w
    left join mapa m on m.mal = w.palabra
),
armado as (
  select id,
         string_agg(palabra, ' ' order by orden) filter (where campo = 'apellido') as apellido,
         string_agg(palabra, ' ' order by orden) filter (where campo = 'nombre') as nombre
    from palabras group by id
)
update public.alumnos a
   set apellido = r.apellido, nombre = r.nombre
  from armado r
 where r.id = a.id
   and (r.apellido, r.nombre) is distinct from (a.apellido, a.nombre)
   -- Si el nombre corregido ya lo tiene otra ficha, son la misma persona
   -- cargada dos veces: se deja como esta y hay que unificarla a mano.
   and not exists (
     select 1 from public.alumnos o
      where o.id <> a.id and o.apellido = r.apellido and o.nombre = r.nombre
   );

commit;`);
}

function q(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}
