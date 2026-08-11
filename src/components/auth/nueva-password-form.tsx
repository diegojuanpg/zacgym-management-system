"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";

const MIN_LENGTH = 8;

export function NuevaPasswordForm() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [password, setPassword] = React.useState("");
  const [repeat, setRepeat] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`La contraseña necesita al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== repeat) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(
        error.status === 401
          ? "El link venció. Pedí uno nuevo desde el login."
          : error.message,
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <Input
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Input
        label="Repetir contraseña"
        type="password"
        autoComplete="new-password"
        required
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
      />

      {error && (
        <Note type="error" fill>
          {error}
        </Note>
      )}

      <Button type="submit" size="lg" loading={loading} className="w-full">
        Guardar
      </Button>
    </form>
  );
}
