import { fechaCorta } from "@/lib/utils";

/** El texto de la celda cuando no hay planilla que abrir. */
const SIN_DATO = (
  <span className="text-[var(--ds-gray-900)]" aria-label="sin dato">
    —
  </span>
);

/**
 * La semana de entrenamiento que el alumno tiene abierta, linkeada a su planilla.
 *
 * Muestra la fecha del bloque visible, o el motivo por el que no se pudo leer.
 * "Revisar" es el que importa: la planilla quedó con dos semanas visibles a la
 * vez y hay que ir a mirarla, que es justamente lo que el link resuelve.
 *
 * Lo que se lee acá lo escribe el pipeline `semanaRutina`. Que esté vacío no
 * significa que el alumno no entrene: puede que todavía no le hayan leído la
 * planilla, porque solo se leen los que entrenaron el último mes o tienen la
 * cuota al día.
 */
export function Entrenamiento({
  sheetId,
  semana,
  estado,
}: {
  sheetId: string | null;
  semana: string | null;
  estado: string | null;
}) {
  if (!semana && !estado) return SIN_DATO;

  // Sin fecha siempre dice "Revisar", sea porque quedaron dos semanas abiertas o
  // porque la grilla esta corrida. Las dos cosas se arreglan igual: entrando a
  // mirar la planilla. El motivo exacto va en el tooltip, que es donde se busca
  // cuando ya decidiste entrar; en la celda solo estorba y no entra.
  const texto = semana ? fechaCorta(semana, "2-digit") : "Revisar";

  // Sin planilla no hay a dónde ir: se muestra el texto pelado en vez de un
  // link roto.
  if (!sheetId) {
    return <span className={semana ? undefined : "text-[var(--ds-amber-900)]"}>{texto}</span>;
  }

  return (
    <a
      href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`}
      target="_blank"
      rel="noopener noreferrer"
      title={semana ? "Abrir la rutina" : `${estado}. Abrir la rutina.`}
      className={
        semana
          ? "underline decoration-dotted underline-offset-2 hover:decoration-solid"
          : // El motivo va en ámbar: es algo para ir a mirar, no un dato más.
            "text-[var(--ds-amber-900)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
      }
    >
      {texto}
    </a>
  );
}
