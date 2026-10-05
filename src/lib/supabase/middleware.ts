import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safeNext";

// Refreshes the Supabase auth session on every request and redirects
// anonymous visitors to /login (except the login page itself), carrying
// the page they asked for as ?next= so login can send them back there.
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
  // `user` the way session-backed routes do. Same for the Wablas webhooks
  // (incoming messages, delivery tracking): no session, just
  // ?token=$WABLAS_WEBHOOK_SECRET, which each route checks and fails
  // closed on — without this they were silently 307'd to /login.
  const isPublicApi =
    request.nextUrl.pathname.startsWith("/api/extract-receipt") ||
    request.nextUrl.pathname.startsWith("/api/unpaid-months") ||
    request.nextUrl.pathname.startsWith("/api/cron/") ||
    request.nextUrl.pathname.startsWith("/api/webhooks/");

  // Shareable how-to-pay guide (real screenshots of the public Bayar IPL
  // form) — meant to be sent directly to residents, e.g. in the warga
  // WhatsApp group, so it must be viewable without an account. Same
  // reasoning for the security check-in/patrol pages — a guard has no
  // login, just a shared link + PIN (see security_guards.pin comment in
  // schema.sql). /pengelolaan-sampah is the waste-management info page
  // linked from /login, also meant to be shared with residents.
  const isPublicPage =
    request.nextUrl.pathname.startsWith("/tutorial-bayar-ipl") ||
    request.nextUrl.pathname.startsWith("/pengelolaan-sampah") ||
    request.nextUrl.pathname.startsWith("/security/checkin") ||
    request.nextUrl.pathname.startsWith("/security/patroli");

  if (!user && !isLoginPage && !isPublicApi && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Pages only — an API call bounced here has no page to come back to.
    // "/" isn't worth remembering either, it just redirects onward.
    const { pathname, search } = request.nextUrl;
    if (!pathname.startsWith("/api/") && pathname !== "/") {
      url.searchParams.set("next", pathname + search);
    }
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    // e.g. an old /login?next=... link opened in a tab that's since
    // logged in — go straight to where it was headed.
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    const url = request.nextUrl.clone();
    url.search = "";
    url.pathname = "/report";
    return NextResponse.redirect(next ? new URL(next, request.url) : url);
  }

  return supabaseResponse;
}
