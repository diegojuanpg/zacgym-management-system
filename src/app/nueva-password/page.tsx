import type { Metadata } from "next";
import { NuevaPasswordForm } from "@/components/auth/nueva-password-form";

export const metadata: Metadata = { title: "Nueva contraseña — ZacGym" };

export default function NuevaPasswordPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-xs flex-col items-center gap-6">
        <h1 className="text-heading-20">Elegí una nueva contraseña</h1>
        <NuevaPasswordForm />
      </div>
    </main>
  );
}
