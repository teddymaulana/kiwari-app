"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

export async function updateMonthlyAmount(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const monthly_amount = Number(formData.get("monthly_amount"));
  if (!monthly_amount || monthly_amount <= 0) return;

  const supabase = await createClient();

  await supabase
    .from("settings")
    .update({ monthly_amount, updated_at: new Date().toISOString() })
    .eq("id", 1);

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "settings.update_amount",
    detail: `monthly_amount -> ${monthly_amount}`,
  });

  revalidatePath("/settings");
}

// Creates a new login for a resident. Always lands as role "warga" — this
// panel is not for creating other pengurus accounts (do that via SQL, see
// README, so it stays a deliberate action).
export async function createWargaUser(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const household_id = String(formData.get("household_id") || "");

  if (!email || password.length < 6 || !household_id) {
    redirect(
      "/settings?error=" +
        encodeURIComponent(
          "Email, password (min. 6 karakter), dan rumah wajib diisi"
        )
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ household_id })
    .eq("id", data.user.id);

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "user.create_warga",
    detail: `${email} (${data.user.id}) -> household ${household_id}`,
  });

  revalidatePath("/settings");
  redirect("/settings?success=1");
}

// Approves a payment claim submitted anonymously via the public "Bayar IPL"
// form on /login — flips it from "pending" to "confirmed" so it starts
// counting as Lunas everywhere (dashboard, report, CSV export).
export async function confirmPaymentClaim(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const supabase = await createClient();

  const { data: claim } = await supabase
    .from("payments")
    .update({
      status: "confirmed",
      recorded_by: user.email,
      paid_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("household_id, period_year, period_month, amount")
    .single();

  if (claim) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "payment.confirm_claim",
      detail: `household ${claim.household_id} - ${claim.period_month}/${claim.period_year} - ${claim.amount}`,
    });
  }

  revalidatePath("/settings");
}

// Rejects a pending claim by deleting it — this frees up that period so
// the household can submit a corrected claim (the unique constraint on
// household_id+period_year+period_month would otherwise block a retry).
export async function rejectPaymentClaim(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const supabase = await createClient();

  const { data: claim } = await supabase
    .from("payments")
    .delete()
    .eq("id", id)
    .eq("status", "pending")
    .select("household_id, period_year, period_month, amount")
    .single();

  if (claim) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "payment.reject_claim",
      detail: `household ${claim.household_id} - ${claim.period_month}/${claim.period_year} - ${claim.amount}`,
    });
  }

  revalidatePath("/settings");
}
