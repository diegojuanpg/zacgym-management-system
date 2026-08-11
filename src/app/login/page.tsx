import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Entrar — ZacGym" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-xs flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-heading-24">ZacGym</h1>
          <p className="text-copy-14 text-muted-foreground">Gestión interna</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
