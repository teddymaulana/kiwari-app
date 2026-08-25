import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type Role = "warga" | "pengurus";

const VIEW_AS_COOKIE = "view_as_warga";

// Recording an expense (Catat Pengeluaran on /expenses) is restricted to
// these two pengurus accounts specifically, not every pengurus login —
// checked both in the UI (page.tsx) and again in the server action
// (actions.ts) that actually writes the row.
export const EXPENSE_RECORDERS = ["18g@kiwari.local", "19b@kiwari.local"];

// Recording an IPL payment (Catat Pembayaran Iuran on /payments/new) is
// restricted to these two pengurus accounts, checked both in the UI
// (payments/new/page.tsx) and again in the server action
// (payments/new/actions.ts). Doesn't apply to Verifikasi Pembayaran
// (Konfirmasi/Tolak) on the same page — see PAYMENT_VERIFIERS below.
export const PAYMENT_RECORDERS = ["18g@kiwari.local", "19b@kiwari.local"];

// Verifikasi Pembayaran (the pending-claims list on /payments/new) is
// visible to every pengurus so anyone can see what's awaiting review, but
// only this account can actually click Konfirmasi/Tolak — checked both in
// the UI (payments/new/page.tsx) and again in the server actions
// (payments/new/actions.ts).
export const PAYMENT_VERIFIERS = ["18g@kiwari.local"];

// Recording a Sumbangan (Catat Sumbangan on /contributions) is restricted
// to this one pengurus account, checked both in the UI
// (contributions/page.tsx) and again in the server action
// (contributions/actions.ts).
export const CONTRIBUTION_RECORDERS = ["18g@kiwari.local"];

// Deleting a Sumbangan (contribution) entry — warga-linked or external
// ("Lain-lain") — is restricted to this one pengurus account, checked both
// in the UI (contributions/page.tsx) and again in the server action
// (contributions/actions.ts).
export const CONTRIBUTION_DELETERS = ["18g@kiwari.local"];

// Deleting a recorded IPL payment (e.g. entered by mistake, or a bank
// transfer claim that turned out not to have gone through) is restricted
// to this one pengurus account, checked both in the UI (payments/page.tsx)
// and again in the server action (payments/actions.ts).
export const PAYMENT_DELETERS = ["18g@kiwari.local"];

// Toggling a household's Aktif/Nonaktif status (on /households) is
// restricted to this one pengurus account, checked both in the UI
// (households/page.tsx) and again in the server action
// (households/actions.ts).
export const HOUSEHOLD_TOGGLERS = ["18g@kiwari.local"];

export type CurrentUser = {
  id: string;
  email: string;
  // Effective role for this request — a pengurus who's toggled "Lihat
  // sebagai Warga" (see viewAs.ts) sees "warga" here, so every existing
  // `role !== "pengurus"` guard across the app naturally treats them as
  // warga without needing separate preview-mode logic everywhere.
  role: Role;
  // The real role from `profiles`, unaffected by the preview toggle — use
  // this to decide whether to show the toggle itself, and never as a
  // security check (RLS already enforces the real role at the DB level;
  // this cookie is UI-only and never restricts what a pengurus can
  // actually read/write).
  actualRole: Role;
  householdId: string | null;
  unitNo: string | null;
};

// Cached per request so layout.tsx and page components can each call this
// without re-querying the profile row every time.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, household_id, households(unit_no)")
    .eq("id", user.id)
    .single<{
      role: Role;
      household_id: string | null;
      households: { unit_no: string } | null;
    }>();

  const actualRole: Role = profile?.role ?? "warga";

  const cookieStore = await cookies();
  const viewingAsWarga =
    actualRole === "pengurus" &&
    cookieStore.get(VIEW_AS_COOKIE)?.value === "1";

  return {
    id: user.id,
    email: user.email ?? "",
    role: viewingAsWarga ? "warga" : actualRole,
    actualRole,
    householdId: profile?.household_id ?? null,
    unitNo: profile?.households?.unit_no ?? null,
  };
});
