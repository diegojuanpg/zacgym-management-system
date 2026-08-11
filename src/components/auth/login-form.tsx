"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = React.useMemo(() => createClient(), []);

  const [mode, setMode] = React.useState<"login" | "recover">("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (mode === "recover") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/nueva-password`,
      });
      setLoading(false);
      // No delatamos si el email existe o no.
      if (error && error.status !== 400) setError(error.message);
      else setSent(true);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(
        error.status === 400
          ? "Email o contraseña incorrectos."
          : error.status === 429
            ? "Demasiados intentos. Esperá un minuto."
            : error.message,
      );
      return;
    }
    router.replace(params.get("next") || "/");
    router.refresh();
  }

  if (sent) {
    return (
      <Note type="success" fill>
        Si esa cuenta existe, le mandamos un mail con el link para cambiar la contraseña.
      </Note>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <Input
        label="Email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="vos@zacgym.com"
      />

      {mode === "login" && (
        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}

      {error && (
        <Note type="error" fill>
          {error}
        </Note>
      )}

      <Button type="submit" size="lg" loading={loading} className="w-full">
        {mode === "login" ? "Entrar" : "Mandar link de recuperación"}
      </Button>

      <Button
        type="button"
        variant="tertiary"
        size="sm"
        onClick={() => {
          setMode(mode === "login" ? "recover" : "login");
          setError(null);
        }}
      >
        {mode === "login" ? "Olvidé mi contraseña" : "Volver al login"}
      </Button>
    </form>
  );
}
