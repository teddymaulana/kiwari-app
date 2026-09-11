"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, SECURITY_KEHADIRAN_ACCESS } from "@/lib/auth";

export async function setGuardPin(guardId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!SECURITY_KEHADIRAN_ACCESS.includes(user.email)) return;

  const pin = String(formData.get("pin") || "").trim();
  if (!/^\d{4,6}$/.test(pin)) {
    redirect(
      "/security/kehadiran?error=" +
        encodeURIComponent("PIN harus 4-6 digit angka")
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("security_guards")
    .update({ pin })
    .eq("id", guardId);

  if (error) {
    redirect("/security/kehadiran?error=" + encodeURIComponent(error.message));
  }

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "security.set_pin",
    detail: `guard ${guardId}`,
  });

  revalidatePath("/security/kehadiran");
}

export async function confirmCheckin(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!SECURITY_KEHADIRAN_ACCESS.includes(user.email)) return;

  const supabase = await createClient();
  const { data: checkin } = await supabase
    .from("security_checkins")
    .update({
      status: "confirmed",
      confirmed_by: user.email,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("guard_id, shift_date, shift_type")
    .single();

  if (checkin) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "security.confirm_checkin",
      detail: `${id} - ${checkin.shift_date} ${checkin.shift_type}`,
    });
  }

  revalidatePath("/security/kehadiran");
}

export async function rejectCheckin(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!SECURITY_KEHADIRAN_ACCESS.includes(user.email)) return;

  const supabase = await createClient();
  const { data: checkin } = await supabase
    .from("security_checkins")
    .update({
      status: "rejected",
      confirmed_by: user.email,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("guard_id, shift_date, shift_type")
    .single();

  if (checkin) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "security.reject_checkin",
      detail: `${id} - ${checkin.shift_date} ${checkin.shift_type}`,
    });
  }

  revalidatePath("/security/kehadiran");
}
