import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, DENAH_VIEWERS } from "@/lib/auth";
import DenahMap from "./DenahMap";

export type DenahHousehold = {
  unit_no: string;
  name: string;
  alt_names: string | null;
};

export default async function DenahPage() {
  const user = await getCurrentUser();
  // Same restriction as the nav link (see NavBar/layout.tsx) — this shows
  // household names, so direct navigation is gated too, not just the link.
  if (!user || !DENAH_VIEWERS.includes(user.email)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: households } = await supabase
    .from("households")
    .select("unit_no, name, alt_names")
    .returns<DenahHousehold[]>();

  return <DenahMap households={households ?? []} />;
}
