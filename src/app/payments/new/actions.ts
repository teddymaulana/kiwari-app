"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { sendWhatsAppMessage } from "@/lib/fonnte";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";

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
    .select(
      "household_id, period_year, period_month, amount, households(unit_no, phone)"
    )
    .single<{
      household_id: string;
      period_year: number;
      period_month: number;
      amount: number;
      households: { unit_no: string; phone: string | null } | null;
    }>();

  if (claim) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "payment.confirm_claim",
      detail: `household ${claim.household_id} - ${claim.period_month}/${claim.period_year} - ${claim.amount}`,
    });

    // Best-effort notification — a WhatsApp failure (no phone on file,
    // Fonnte device disconnected, etc.) must never block the confirmation
    // itself, which has already succeeded above.
    if (claim.households?.phone) {
      const message = `Halo, pembayaran IPL ${MONTH_NAMES[claim.period_month - 1]} ${claim.period_year} untuk ${claim.households.unit_no} sebesar ${formatRupiah(Number(claim.amount))} telah dikonfirmasi pengurus. Terima kasih!`;
      const result = await sendWhatsAppMessage(claim.households.phone, message);
      await supabase.from("activity_log").insert({
        actor_email: user.email,
        action: result.success ? "whatsapp.send" : "whatsapp.send_failed",
        detail: result.success
          ? `notif konfirmasi pembayaran -> ${claim.households.phone}`
          : `notif konfirmasi pembayaran -> ${claim.households.phone} - ${result.reason}`,
      });
    }
  }

  revalidatePath("/payments/new");
  revalidatePath("/report");
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

  revalidatePath("/payments/new");
}
