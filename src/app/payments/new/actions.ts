"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export async function recordPayment(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const household_id = String(formData.get("household_id") || "");
  const period_year = Number(formData.get("period_year"));
  const period_month = Number(formData.get("period_month"));
  const amount = Number(formData.get("amount"));
  const paid_date = String(formData.get("paid_date") || "");
  const note = String(formData.get("note") || "").trim();
  const kas_type = String(formData.get("kas_type") || "bri");

  if (!household_id || !period_year || !period_month || !amount) {
    redirect("/payments/new?error=Lengkapi semua data wajib");
  }
  if (kas_type !== "tunai" && kas_type !== "bri") {
    redirect("/payments/new?error=Sumber kas tidak valid");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("payments").insert({
    household_id,
    period_year,
    period_month,
    amount,
    paid_date: paid_date || undefined,
    note: note || null,
    kas_type,
    recorded_by: user.email,
  });

  if (error) {
    // Most likely a duplicate (unique constraint on household+period).
    redirect(`/payments/new?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.from("activity_log").insert({
    actor_email: user?.email,
    action: "payment.create",
    detail: `household ${household_id} - ${period_month}/${period_year} - ${amount} - ${kas_type}`,
  });

  revalidatePath("/report");
  redirect("/dashboard?success=1");
}
