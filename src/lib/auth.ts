import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type Role = "warga" | "pengurus";

const VIEW_AS_COOKIE = "view_as_warga";

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
