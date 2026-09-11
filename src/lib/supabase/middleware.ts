import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on every request and redirects
// anonymous visitors to /login (except the login page itself).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  // Both back the anonymous "Bayar IPL" form on /login: OCR-matching a
  // receipt, and loading which months are still unpaid once a household
  // is picked. Without this allowlist, an anonymous fetch to either gets
  // redirected to /login (HTML) instead of JSON, breaking res.json() on
  // the client with "Unexpected token '<'".
  // Vercel Cron requests carry no Supabase session cookie, only
  // "Authorization: Bearer $CRON_SECRET" — which the route itself checks
  // (see src/app/api/cron/weekly-report/route.ts) — so this can't gate on
  // `user` the way session-backed routes do.
  const isPublicApi =
    request.nextUrl.pathname.startsWith("/api/extract-receipt") ||
    request.nextUrl.pathname.startsWith("/api/unpaid-months") ||
    request.nextUrl.pathname.startsWith("/api/cron/");

  // Shareable how-to-pay guide (real screenshots of the public Bayar IPL
  // form) — meant to be sent directly to residents, e.g. in the warga
  // WhatsApp group, so it must be viewable without an account. Same
  // reasoning for the security check-in/patrol pages — a guard has no
  // login, just a shared link + PIN (see security_guards.pin comment in
  // schema.sql).
  const isPublicPage =
    request.nextUrl.pathname.startsWith("/tutorial-bayar-ipl") ||
    request.nextUrl.pathname.startsWith("/security/checkin") ||
    request.nextUrl.pathname.startsWith("/security/patroli");

  if (!user && !isLoginPage && !isPublicApi && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/report";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
