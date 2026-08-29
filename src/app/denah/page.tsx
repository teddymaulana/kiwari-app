import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import DenahMap from "./DenahMap";

export type DenahHousehold = {
  unit_no: string;
  name: string;
  alt_names: string | null;
};

export default async function DenahPage() {
  const user = await getCurrentUser();
  // Open to any logged-in warga/pengurus — direct navigation is still
  // gated to require a login, since this shows household names.
  if (!user) redirect("/dashboard");

  const supabase = await createClient();
  const { data: households } = await supabase
    .from("households")
    .select("unit_no, name, alt_names")
    .returns<DenahHousehold[]>();

  return <DenahMap households={households ?? []} />;
}
