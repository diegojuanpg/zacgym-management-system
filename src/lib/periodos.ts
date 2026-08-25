/**
 * Períodos del encabezado de Fecha. El corte se calcula acá y se manda a la
 * base: traer todo el historial para descartarlo en memoria deja de andar
 * apenas el gimnasio lleve un par de años cargados.
 */
export const PERIODOS = [
  // El primero es el que sale por defecto. Arranca en todo: acotar de entrada
  // escondia el historico y dejaba solapas en cero que parecian datos faltantes.
  { valor: "todo", label: "Todo", dias: null },
  { valor: "7d", label: "Últimos 7 días", dias: 7 },
  { valor: "30d", label: "Últimos 30 días", dias: 30 },
  { valor: "90d", label: "Últimos 90 días", dias: 90 },
  { valor: "365d", label: "Último año", dias: 365 },
] as const;

