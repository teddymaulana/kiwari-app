import { createAdminClient } from "@/lib/supabase/admin";
import { sendViaWablas } from "@/lib/wablas";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";

// Unit whose kepala keluarga gets pinged on every new claim so verification
// doesn't wait for someone to happen to check Verifikasi Pembayaran —
// mirrors the account-allowlist convention elsewhere (18g@kiwari.local is
// this same unit's pengurus login).
const CLAIM_NOTIFY_UNIT = "18G";

// Deliberately not fully driven by the settings.whatsapp_provider toggle
// (src/lib/whatsapp.ts) — this fires from an anonymous public form
// submission with no pengurus present, so it can never use the "manual"
// (wa.me, click-to-send) option. Always Wablas whenever the toggle isn't
// "off", so this specific notification keeps working no matter which
// gateway/manual choice is set for the admin-attended flows — "off" is
// the one exception, since that means "no WhatsApp at all" everywhere.

// Shared by the public "Bayar IPL" form on /login (no session) and the
// logged-in warga's version on /dashboard (household comes from the
// session, not form input). Always lands as status "pending" — never
// counts as Lunas until a pengurus confirms it from Pengaturan. Uses the
// admin client because the public path has no session for RLS to key off
// of; status is hardcoded here and never taken from caller input.
//
// periodMonths can carry more than one month (warga paying several months
// in one transfer) — the receipt, if any, is uploaded once and reused
// across all of them rather than duplicated per month.
//
// The per-month amount is never taken from the caller — it's always the
// pengurus-set nominal from Pengaturan, looked up here so neither form (nor
// a tampered request on the public, unauthenticated /login path) can claim
// an arbitrary amount.
export async function createPendingPaymentClaim({
  householdId,
  periodYear,
  periodMonths,
  note,
  receipt,
  actorEmail,
}: {
  householdId: string;
  periodYear: number;
  periodMonths: number[];
  note: string;
  receipt: File | null;
  actorEmail: string | null;
}): Promise<{ success: true; message: string } | { success: false; message: string }> {
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("settings")
    .select("monthly_amount")
    .eq("id", 1)
    .single<{ monthly_amount: number }>();
  const amount = Number(settings?.monthly_amount ?? 0);
  if (!amount) {
    return { success: false, message: "Nominal iuran belum diatur, hubungi pengurus" };
  }

  let receipt_path: string | null = null;
  if (receipt && receipt.size > 0) {
    const ext = receipt.name.split(".").pop() || "jpg";
    const path = `${householdId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("bukti-transfer")
      .upload(path, receipt, { contentType: receipt.type });
    if (!uploadError) receipt_path = path;
  }

  const months = [...new Set(periodMonths)].sort((a, b) => a - b);
  const claimed: number[] = [];
  const failed: { month: number; message: string }[] = [];

  for (const period_month of months) {
    const { error } = await admin.from("payments").insert({
      household_id: householdId,
      period_year: periodYear,
      period_month,
      amount,
      note: note || null,
      status: "pending",
      receipt_path,
      kas_type: "bri",
    });

    if (error) {
      let message = error.message;
      if (error.code === "23505") {
        message = `${MONTH_NAMES[period_month - 1]} ${periodYear} sudah pernah dibayar atau sedang menunggu verifikasi`;
      }
      failed.push({ month: period_month, message });
    } else {
      claimed.push(period_month);
      await admin.from("activity_log").insert({
        actor_email: actorEmail,
        action: "payment.claim_pending",
        detail: `household ${householdId} - ${period_month}/${periodYear} - ${amount}`,
      });
    }
  }

  if (claimed.length === 0) {
    if (receipt_path) {
      await admin.storage.from("bukti-transfer").remove([receipt_path]);
    }
    return {
      success: false,
      message: failed[0]?.message ?? "Gagal mengirim klaim",
    };
  }

  const claimedLabel = claimed.map((m) => MONTH_NAMES[m - 1]).join(", ");
  let message = `Klaim terkirim untuk ${claimedLabel} ${periodYear}.`;
  if (failed.length > 0) {
    message += ` Gagal: ${failed.map((f) => f.message).join("; ")}`;
  }

  // Best-effort notification to the designated unit so a new pending claim
  // gets verified promptly — must never fail the claim itself, which has
  // already succeeded above.
  const provider = await getWhatsAppProvider();
  const [{ data: submitterHousehold }, { data: notifyHousehold }] =
    provider === "off"
      ? [{ data: null }, { data: null }]
      : await Promise.all([
          admin
            .from("households")
            .select("unit_no, name")
            .eq("id", householdId)
            .single<{ unit_no: string; name: string }>(),
          admin
            .from("households")
            .select("phone")
            .ilike("unit_no", CLAIM_NOTIFY_UNIT)
            .single<{ phone: string | null }>(),
        ]);

  if (notifyHousehold?.phone && submitterHousehold) {
    const notifyMessage = `Halo, ada klaim pembayaran IPL baru dari ${submitterHousehold.unit_no} - ${submitterHousehold.name} untuk ${claimedLabel} ${periodYear} (${formatRupiah(amount * claimed.length)}), menunggu verifikasi.`;
    const result = await sendViaWablas(notifyHousehold.phone, notifyMessage);
    await admin.from("activity_log").insert({
      actor_email: actorEmail,
      action: result.success ? "whatsapp.send" : "whatsapp.send_failed",
      detail: result.success
        ? `notif klaim baru -> ${notifyHousehold.phone} - ${result.detail}`
        : `notif klaim baru -> ${notifyHousehold.phone} - ${result.reason} - ${result.detail}`,
    });
  }

  return { success: true, message };
}
