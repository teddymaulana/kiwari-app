"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

// Records one confirmed payment row per selected month — mirrors the
// warga-facing "Bayar IPL" claim form (paymentClaim.ts) in letting
// pengurus pick several unpaid months at once instead of one at a time,
// but lands straight as "confirmed" since a pengurus is entering it
// directly rather than submitting a claim to be verified.
export async function recordPayments(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const household_id = String(formData.get("household_id") || "");
  const period_year = Number(formData.get("period_year"));
  const period_months = formData
    .getAll("period_months")
    .map((m) => Number(m))
    .filter((m) => m >= 1 && m <= 12);
  const amount = Number(formData.get("amount"));
  const paid_date = String(formData.get("paid_date") || "");
  const note = String(formData.get("note") || "").trim();
  const kas_type = String(formData.get("kas_type") || "bri");

  if (!household_id || !period_year || period_months.length === 0 || !amount) {
    redirect("/payments/new?error=Lengkapi semua data wajib");
  }
  if (kas_type !== "tunai" && kas_type !== "bri") {
    redirect("/payments/new?error=Sumber kas tidak valid");
  }

  const supabase = await createClient();

  const results = await Promise.all(
    period_months.map((period_month) =>
      supabase
        .from("payments")
        .insert({
          household_id,
          period_year,
          period_month,
          amount,
          paid_date: paid_date || undefined,
          note: note || null,
          kas_type,
          recorded_by: user.email,
        })
        .select("period_month")
        .single()
    )
  );

  const saved = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  if (saved.length === 0) {
    // Most likely every selected month is a duplicate (unique constraint
    // on household+period).
    redirect(`/payments/new?error=${encodeURIComponent(failed[0].error!.message)}`);
  }

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "payment.create",
    detail: `household ${household_id} - ${saved
      .map((r) => r.data!.period_month)
      .join(",")}/${period_year} - ${amount} x${saved.length} - ${kas_type}`,
  });

  revalidatePath("/report");

  if (failed.length > 0) {
    redirect(
      `/payments/new?error=${encodeURIComponent(
        `${saved.length} bulan tersimpan, ${failed.length} gagal (kemungkinan sudah lunas): ${failed[0].error!.message}`
      )}`
    );
  }

  redirect("/dashboard?success=1");
}
