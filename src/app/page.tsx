import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const staff = await requireStaff();

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-heading-24">ZacGym</h1>
      <div className="flex items-center gap-2">
        <span className="text-copy-14 text-muted-foreground">{staff.email}</span>
        <Badge variant={staff.role === "admin" ? "gray-subtle" : "blue-subtle"}>
          {staff.role}
        </Badge>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="secondary">
          Cerrar sesión
        </Button>
      </form>
    </main>
  );
}
