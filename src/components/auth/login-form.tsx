"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const campo =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground";
const boton =
  "w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50";

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
      <p className="rounded-md border border-border px-3 py-2 text-sm">
        Si esa cuenta existe, le mandamos un mail con el link para cambiar la contraseña.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          className={campo}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vos@zacgym.com"
        />
      </label>

      {mode === "login" && (
        <label className="flex flex-col gap-1 text-sm">
          Contraseña
          <input
            className={campo}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" className={boton} disabled={loading}>
        {loading ? "..." : mode === "login" ? "Entrar" : "Mandar link de recuperación"}
      </button>

      <button
        type="button"
        className="text-sm text-muted hover:text-foreground"
        onClick={() => {
          setMode(mode === "login" ? "recover" : "login");
          setError(null);
        }}
      >
        {mode === "login" ? "Olvidé mi contraseña" : "Volver al login"}
      </button>
    </form>
  );
}
