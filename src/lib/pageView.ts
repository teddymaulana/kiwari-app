import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth";

// Vercel Analytics (src/app/layout.tsx) tracks anonymous, aggregate page
// views — good for "how much is this page used" but can't say who visited.
// This ties a visit to a household by logging it into activity_log, the
// same audit trail every other action in the app already writes to.
// Best-effort: a logging failure must never break the page itself.
//
// Admin client, not the regular session-bound one: activity_log writes are
// pengurus-only under RLS (see schema.sql), but a warga's own visit still
// needs to land a row here — same reasoning as profile/actions.ts.
//
// No-op for anonymous visitors (user === null) — there's no identity to
// attach the visit to, so nothing useful to log.
export async function logPageView(user: CurrentUser | null, page: string) {
  if (!user) return;
  try {
    const admin = createAdminClient();
    await admin.from("activity_log").insert({
      actor_email: user.email,
      action: "page_view",
      detail: page,
    });
  } catch {
    // Best-effort — see comment above.
  }
}
