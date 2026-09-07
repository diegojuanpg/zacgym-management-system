"use server";

import { requireStaff } from "@/lib/auth";
import { MAX_LOTE, type Resultado, type Semana } from "@/lib/rutinas-lote";

/**
 * Las acciones sobre las planillas de rutina, que no viven en la base.
 *
 * La planilla de cada alumno es un Google Sheet y todo lo que se le hace pasa
 * por Apps Script: mover el bloque de rutina, compartirla, quitarle el acceso.
 * Desde acá no hay forma de tocarlas —haría falta una service account de Google
 * y duplicar el motor que ya existe allá—, así que el mostrador le habla al
 * endpoint `doPost` de `pipelines/apps-script-control/Api.gs`.
 *
 * Ese endpoint es público —Apps Script no ofrece otra cosa para que le pegue
 * algo sin cuenta de Google—, así que lo único que lo protege es el secret.
 * Nunca sale del server: estas funciones corren en el server y el browser solo
 * ve el resultado.
 */

interface Respuesta {
  ok: boolean;
  error?: string;
  resultados?: Resultado[];
  hechos?: number;
  semana?: string;
}

/**
 * El pedido a Apps Script.
 *
 * Errores de red y respuestas raras vuelven como `{ error }` en vez de tirar:
 * del otro lado hay un Google Sheet por alumno y lo que el mostrador necesita
 * es que la pantalla diga qué pasó, no un 500.
 */
async function pedir(cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const url = process.env.APPS_SCRIPT_URL;
  const secret = process.env.APPS_SCRIPT_SECRET;
  if (!url || !secret) {
    return { ok: false, error: "Falta configurar APPS_SCRIPT_URL y APPS_SCRIPT_SECRET." };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...cuerpo, secret }),
      // Apps Script responde con un redirect a googleusercontent.com; `fetch`
      // lo sigue solo. Sin caché: cada pedido escribe.
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "No se pudo hablar con Apps Script." };
  }

  const texto = await res.text();
  if (!res.ok) {
    return { ok: false, error: `Apps Script respondió ${res.status}.` };
  }
  try {
    return JSON.parse(texto) as Respuesta;
  } catch {
    // Pasa cuando la implementación quedó sin autorizar: Google devuelve el
    // HTML de la pantalla de login en vez del JSON.
    return {
      ok: false,
      error: "Apps Script no devolvió JSON. Revisá que la implementación esté como "
        + '"Ejecutar como: yo" y "Quien tiene acceso: cualquier usuario".',
    };
  }
}

function revisarLote(alumnos: string[]): string | null {
  if (alumnos.length === 0) return "Elegí al menos un alumno.";
  if (alumnos.length > MAX_LOTE) return `Máximo ${MAX_LOTE} alumnos por vez.`;
  return null;
}

/**
 * Avanza el bloque de rutina de hasta diez alumnos.
 *
 * Cada planilla tarda unos segundos, así que un lote de diez puede irse a un
 * minuto largo. Apps Script corta a los cinco y devuelve como error los que no
 * llegó a hacer: se reintentan mandándolos de nuevo.
 */
export async function actualizarRutinas(
  alumnos: string[],
  semana: Semana,
): Promise<{ resultados?: Resultado[]; error?: string }> {
  await requireStaff();
  const mal = revisarLote(alumnos);
  if (mal) return { error: mal };

  const r = await pedir({ accion: "rutinas", semana, alumnos });
  if (!r.ok) return { error: r.error ?? "Apps Script no pudo con el lote." };
  return { resultados: r.resultados ?? [] };
}

/**
 * Comparte o descomparte la planilla de hasta diez alumnos.
 *
 * Compartir la deja siempre con las tres casillas de Drive destildadas —los
 * editores no pueden re-compartir, y nadie puede descargar, imprimir ni
 * copiar—. Eso lo aplica Apps Script antes de dar el acceso.
 */
export async function cambiarAccesoRutina(
  alumnos: string[],
  compartir: boolean,
): Promise<{ resultados?: Resultado[]; error?: string }> {
  await requireStaff();
  const mal = revisarLote(alumnos);
  if (mal) return { error: mal };

  const r = await pedir({ accion: "acceso", compartir, alumnos });
  if (!r.ok) return { error: r.error ?? "Apps Script no pudo con el lote." };
  return { resultados: r.resultados ?? [] };
}
