"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import { sendWhatsAppMessage } from "@/lib/fonnte";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";

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

// Kas balance carried over from before this app existed — not income, so
// it's stored on settings (like monthly_amount) rather than as a
// payment/expense row. Added into the running totals on /report.
export async function updateOpeningBalance(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const opening_balance_bri = Number(formData.get("opening_balance_bri"));
  const opening_balance_tunai = Number(formData.get("opening_balance_tunai"));
  if (
    !Number.isFinite(opening_balance_bri) ||
    !Number.isFinite(opening_balance_tunai) ||
    opening_balance_bri < 0 ||
    opening_balance_tunai < 0
  ) {
    return;
  }

  const supabase = await createClient();

  await supabase
    .from("settings")
    .update({
      opening_balance_bri,
      opening_balance_tunai,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "settings.update_opening_balance",
    detail: `bri -> ${opening_balance_bri}, tunai -> ${opening_balance_tunai}`,
  });

  revalidatePath("/settings");
  revalidatePath("/report");
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

  revalidatePath("/settings");
  revalidatePath("/report");
}

// Manual WhatsApp send, for testing the Fonnte integration before it's
// wired into automatic events (e.g. payment confirmed).
export async function sendTestWhatsApp(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const phone = String(formData.get("phone") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!phone || !message) {
    redirect(
      "/settings?wa_error=" +
        encodeURIComponent("No. HP dan pesan wajib diisi")
    );
  }

  const result = await sendWhatsAppMessage(phone, message);

  const supabase = await createClient();
  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: result.success ? "whatsapp.send" : "whatsapp.send_failed",
    detail: result.success
      ? `${phone} - ${message}`
      : `${phone} - ${result.reason}`,
  });

  if (!result.success) {
    redirect(`/settings?wa_error=${encodeURIComponent(result.reason)}`);
  }

  redirect("/settings?wa_success=1");
}

// Moves money between the two kas — e.g. the treasurer withdraws cash from
// the bank BRI account to top up petty cash on hand, or deposits leftover
// cash back into the bank. Doesn't change the total treasury balance, only
// the split shown on /report (Petty Cash vs Kas BRI).
export async function recordCashTransfer(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const amount = Number(formData.get("amount"));
  const direction = String(formData.get("direction") || "");
  const transfer_date = String(formData.get("transfer_date") || "");
  const note = String(formData.get("note") || "").trim();

  if (!amount || amount <= 0) {
    redirect(
      `/settings?kas_error=${encodeURIComponent("Jumlah wajib diisi dan lebih dari 0")}`
    );
  }
  if (direction !== "bri_to_tunai" && direction !== "tunai_to_bri") {
    redirect(`/settings?kas_error=${encodeURIComponent("Arah transfer tidak valid")}`);
  }

  const supabase = await createClient();

  const { error } = await supabase.from("cash_transfers").insert({
    amount,
    direction,
    transfer_date: transfer_date || undefined,
    note: note || null,
    recorded_by: user.email,
  });

  if (error) {
    redirect(`/settings?kas_error=${encodeURIComponent(error.message)}`);
  }

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "kas.transfer",
    detail: `${direction} - ${amount}${note ? ` - ${note}` : ""}`,
  });

  revalidatePath("/settings");
  revalidatePath("/report");
  redirect("/settings?kas_success=1");
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
