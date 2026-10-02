// The page to return to after login, carried as /login?next=... (set by
// the auth proxy in supabase/middleware.ts when it bounces an anonymous
// visitor). Only same-site paths are accepted — "//evil.com" or
// "/\evil.com" would be treated by browsers as another host, and an
// absolute URL would make /login an open redirect anyone could put in a
// link. /login itself is rejected too, so it can't loop.
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) {
    return null;
  }
  return next;
}
