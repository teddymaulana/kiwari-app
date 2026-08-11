"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateMonthlyAmount(formData: FormData) {
  const monthly_amount = Number(formData.get("monthly_amount"));
  if (!monthly_amount || monthly_amount <= 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("settings")
    .update({ monthly_amount, updated_at: new Date().toISOString() })
    .eq("id", 1);

  await supabase.from("activity_log").insert({
    actor_email: user?.email,
    action: "settings.update_amount",
    detail: `monthly_amount -> ${monthly_amount}`,
  });

  revalidatePath("/settings");
}
