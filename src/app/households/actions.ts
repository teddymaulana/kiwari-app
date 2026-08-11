"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export async function addHousehold(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const unit_no = String(formData.get("unit_no") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  if (!unit_no || !name) return;

  const supabase = await createClient();

  await supabase.from("households").insert({
    unit_no,
    name,
    phone: phone || null,
  });

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "household.create",
    detail: `${unit_no} - ${name}`,
  });

  revalidatePath("/households");
}

export async function toggleHouseholdActive(id: string, isActive: boolean) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const supabase = await createClient();

  await supabase
    .from("households")
    .update({ is_active: !isActive })
    .eq("id", id);

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "household.toggle_active",
    detail: `${id} -> ${!isActive}`,
  });

  revalidatePath("/households");
}
