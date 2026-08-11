import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const staff = await requireStaff();

  async function cerrarSesion() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">ZacGym</h1>
      <p className="text-sm text-muted">
        {staff.email} — {staff.role}
      </p>
      <form action={cerrarSesion}>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-foreground/5"
        >
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
