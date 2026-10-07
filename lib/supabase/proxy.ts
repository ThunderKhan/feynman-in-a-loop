import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the auth token on every request and passes the refreshed claims
 * to Server Components, so they never attempt to refresh the same token.
 *
 * SECURITY: identity is verified with getClaims(), which validates the JWT
 * signature against the project's published public keys. getSession() is
 * deliberately never used on the server — it does not revalidate the token,
 * and cookies can be spoofed.
 */
/** Routes reachable without an authenticated session. */
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Signature-validated. Do not replace with getSession().
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims?.sub ? { id: data.claims.sub } : null;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);

  // Signed-out users may only reach public routes; everything else bounces to
  // /login, which is itself public so this cannot loop.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Signed-in users have no reason to see the auth screens.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/teach";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}