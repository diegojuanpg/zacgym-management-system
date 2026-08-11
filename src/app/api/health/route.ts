import { createClient } from "@/lib/supabase/server";

// Smallest end-to-end check: env vars loaded + local Supabase reachable.
export async function GET() {
  const supabase = await createClient();
  const { error } = await supabase.auth.getUser();
  const supabaseOk = !error || error.status === 401 || error.status === 400;

  return Response.json(
    {
      ok: supabaseOk,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      error: supabaseOk ? null : error?.message,
    },
    { status: supabaseOk ? 200 : 503 },
  );
}
