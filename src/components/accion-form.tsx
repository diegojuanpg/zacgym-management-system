"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { Resultado } from "@/lib/acciones";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";

function Enviar({ children, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...props}>
      {children}
    </Button>
  );
}

interface AccionFormProps {
  accion: (prev: Resultado, form: FormData) => Promise<Resultado>;
  children: React.ReactNode;
  enviar: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  /** Vacía los campos cuando la acción sale bien. */
  limpiarAlOk?: boolean;
}

export function AccionForm({
  accion,
  children,
  enviar,
  variant,
  size,
  className,
  limpiarAlOk,
}: AccionFormProps) {
  const [estado, dispatch] = useActionState(accion, {});
  const ref = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (estado.ok && limpiarAlOk) ref.current?.reset();
  }, [estado, limpiarAlOk]);

  return (
    <form ref={ref} action={dispatch} className={className}>
      {children}
      <Enviar variant={variant} size={size}>
        {enviar}
      </Enviar>
      {(estado.error || estado.ok) && (
        <Note type={estado.error ? "error" : "success"} size="sm" fill className="mt-3">
          {estado.error ?? estado.ok}
        </Note>
      )}
    </form>
  );
}
