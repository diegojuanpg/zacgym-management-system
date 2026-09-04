/**
 * Los pipelines de Apps Script, con su horario esperado.
 *
 * El horario no se lee de ningún lado: los triggers viven en Apps Script y no
 * hay API que los liste. La tabla de acá es la copia de `TRIGGERS` en
 * `pipelines/apps-script/Pipelines.gs`, y si allá se cambia una hora, acá
 * también.
 *
 * `huecoHoras` es el máximo que puede pasar entre dos corridas seguidas cuando
 * todo anda bien, más un colchón. Es lo que deja ver que un pipeline dejó de
 * correr: sin eso, el que murió el martes sigue mostrando el "ok" verde de esa
 * última vez y nadie se entera.
 */
export interface Pipeline {
  /** Como lo escribe Apps Script y como lo devuelven las vistas. */
  nombre: string;
  cuando: string;
  huecoHoras: number;
  que: string;
}

export const PIPELINES: Pipeline[] = [
  {
    nombre: "SyncSheetsID",
    cuando: "Todos los días a las 2:00",
    huecoHoras: 26,
    que: "Busca las rutinas en Drive y le pega el sheet_id a cada alumno.",
  },
  {
    nombre: "SyncCheckins",
    cuando: "Cada hora, de 5 a 23",
    // El hueco largo es el de la noche: 23:00 a 5:00 son seis horas.
    huecoHoras: 8,
    que: "Baja los check-ins de PulsoFlow.",
  },
  {
    nombre: "SyncMembers",
    cuando: "Cada hora, de 5 a 23",
    huecoHoras: 8,
    que: "Baja las membresías de PulsoFlow.",
  },
  {
    nombre: "SyncTrainingDays",
    cuando: "Todos los días a las 3:00",
    huecoHoras: 26,
    que: "Cuenta los días programados en la planilla de cada alumno activo.",
  },
  {
    nombre: "SyncTrainingDate",
    cuando: "5:30, 8:30, 12:30 y 17:30",
    // 17:30 a 5:30 son doce horas.
    huecoHoras: 14,
    que: "Lee de cada planilla qué semana tiene abierta.",
  },
  {
    nombre: "RebuildDatabase",
    cuando: "Cada hora, de 5 a 23",
    huecoHoras: 8,
    que: "Rearma alumnos_tracking con lo que trajeron los demás.",
  },
  {
    nombre: "UpdateAthleteProgram",
    cuando: "Domingos a las 3:00",
    huecoHoras: 8 * 24,
    que: "Avanza o repite el bloque de rutina del que entrenó esa semana.",
  },
];

/** Una corrida, tal como la devuelve la vista `pipeline_ultima`. */
export interface Corrida {
  pipeline: string;
  run_id: string;
  inicio: string;
  fin: string;
  errores: number;
  avisos: number;
  lineas: number;
}

export type Estado = "ok" | "avisos" | "error" | "atrasado" | "sin_datos";

/**
 * Cómo está un pipeline según su última corrida.
 *
 * El atraso le gana al error a propósito: cuando algo falla, Apps Script ya
 * manda un mail. Cuando deja de correr no manda nada, y eso es justamente lo
 * que esta pantalla tiene que gritar.
 */
export function estadoDe(p: Pipeline, ultima: Corrida | undefined, ahora: number): Estado {
  if (!ultima) return "sin_datos";
  if (ahora - new Date(ultima.fin).getTime() > p.huecoHoras * 3600_000) return "atrasado";
  if (ultima.errores > 0) return "error";
  if (ultima.avisos > 0) return "avisos";
  return "ok";
}

export const ESTADOS: Record<Estado, { nombre: string; color: "green" | "amber" | "red" | "gray" }> =
  {
    ok: { nombre: "OK", color: "green" },
    avisos: { nombre: "Con avisos", color: "amber" },
    error: { nombre: "Con errores", color: "red" },
    atrasado: { nombre: "Atrasado", color: "red" },
    sin_datos: { nombre: "Sin corridas", color: "gray" },
  };

/**
 * Los que hay que mirar: es el número del circulito en el menú.
 *
 * El reloj se toma acá adentro y no en el layout: `Date.now()` no es puro y
 * llamarlo en el render de un componente es lo que prohíbe `react-hooks/purity`.
 * Sigue siendo un parámetro para que el test pueda fijar la hora.
 */
export function cuantosMal(ultimas: Corrida[], ahora: number = Date.now()): number {
  const porNombre = new Map(ultimas.map((u) => [u.pipeline, u]));
  return PIPELINES.filter((p) => {
    const estado = estadoDe(p, porNombre.get(p.nombre), ahora);
    return estado === "atrasado" || estado === "error";
  }).length;
}
