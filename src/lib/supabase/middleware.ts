import { createServerClient } from "@supabase/ssr";
import { COOKIE_NAME } from "./cookie";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/nueva-password", "/auth"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: COOKIE_NAME },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresca el token si hace falta y verifica la firma en el proceso, contra
  // la clave publica del proyecto (ES256) que queda cacheada en memoria. No
  // meter logica entre createServerClient y esta llamada.
  //
  // Antes era getUser(), que pregunta por red a Supabase Auth: eran dos viajes
  // por navegacion —uno aca y otro en requireStaff()— antes de mirar un dato.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  // Un redirect nuevo pierde las cookies que acaba de rotar getUser(): sin esto
  // el refresh token viejo viaja al proximo request y la sesion se cae sola.
  const redirectTo = (pathname: string, search = "") => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = search;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user && !isPublic) {
    return redirectTo("/login", `?next=${encodeURIComponent(path)}`);
  }

  if (user && path === "/login") {
    return redirectTo("/");
  }

  return response;
}
