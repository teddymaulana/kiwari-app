import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "warga" | "pengurus";

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
  householdId: string | null;
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
    .select("role, household_id")
    .eq("id", user.id)
    .single<{ role: Role; household_id: string | null }>();

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile?.role ?? "warga",
    householdId: profile?.household_id ?? null,
  };
});
