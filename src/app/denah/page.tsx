import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { logPageView } from "@/lib/pageView";
import DenahMap from "./DenahMap";

export type DenahHousehold = {
  unit_no: string;
  name: string;
  alt_names: string | null;
};

export type DenahSecurityGuard = {
  name: string;
};

export default async function DenahPage() {
  const user = await getCurrentUser();
  // Open to any logged-in warga/pengurus — direct navigation is still
  // gated to require a login, since this shows household names.
  if (!user) redirect("/dashboard");

  await logPageView(user, "denah");

  const supabase = await createClient();
  const { data: households } = await supabase
    .from("households")
    .select("unit_no, name, alt_names")
    .returns<DenahHousehold[]>();

  // security_guards is pengurus-only under RLS, but guard names aren't
  // sensitive and this page is open to any logged-in warga (same tradeoff
  // as /security/checkin, which reads guard names via the admin client
  // for a page with no session at all) — so fetch via the admin client
  // rather than gating the whole Pos security panel to pengurus.
  const admin = createAdminClient();
  const { data: securityGuards } = await admin
    .from("security_guards")
    .select("name")
    .eq("is_active", true)
    .order("name")
    .returns<DenahSecurityGuard[]>();

  return (
    <DenahMap
      households={households ?? []}
      securityGuards={securityGuards ?? []}
    />
  );
}
