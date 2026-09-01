import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { sendViaWablas } from "@/lib/wablas";
import { getKasSaatIni, getMonthlyReport } from "@/lib/kasSummary";
import { formatRupiah, MONTH_NAMES } from "@/lib/types";

// Test recipient only, same convention as CLAIM_NOTIFY_UNIT in
// paymentClaim.ts — swap for a real distribution list (all households, or
// a pengurus group) once the report format is confirmed with 18G.
const REPORT_TEST_UNIT = "18G";

export type WeeklyReportResult =
  | { success: true; detail: string }
  | { success: false; reason: string; skipped?: boolean };

// Shared by the Sunday cron trigger (api/cron/weekly-report/route.ts) and
// the manual "Kirim Laporan Mingguan" button on /settings (restricted to
// WEEKLY_REPORT_SENDERS) — same message, same recipient, same logging,
// whether it fires on a schedule or gets clicked by a pengurus.
//
// actorEmail is null for the cron trigger (no session) and the clicking
// pengurus's email for the manual one — recorded as-is in activity_log.
export async function sendWeeklyReport(
  actorEmail: string | null
): Promise<WeeklyReportResult> {
  const provider = await getWhatsAppProvider();
  if (provider === "off") {
    return { success: false, reason: "Layanan WhatsApp sedang dimatikan", skipped: true };
  }

  const admin = createAdminClient();
  const { data: household } = await admin
    .from("households")
    .select("phone")
    .ilike("unit_no", REPORT_TEST_UNIT)
    .single<{ phone: string | null }>();

  if (!household?.phone) {
    return {
      success: false,
      reason: `Tidak ada nomor HP untuk unit ${REPORT_TEST_UNIT}`,
    };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [kasSaatIni, monthly] = await Promise.all([
    getKasSaatIni(),
    getMonthlyReport(year, month),
  ]);

  const paidPercent =
    monthly.totalUnits > 0
      ? Math.round((monthly.paidCount / monthly.totalUnits) * 100)
      : 0;

  const message = [
    `💰 *Kas Saat Ini*`,
    `*${formatRupiah(kasSaatIni)}*`,
    "",
    `📊 *Laporan Bulan Ini (${MONTH_NAMES[month - 1]} ${year})*`,
    `✅ ${monthly.paidCount}/${monthly.totalUnits} Sudah bayar IPL (${paidPercent}%)`,
    `💵 Total Terkumpul: ${formatRupiah(monthly.totalTerkumpul)}`,
    `📉 Pengeluaran: ${formatRupiah(monthly.pengeluaran)}`,
    "",
    "_Laporan otomatis, dikirim setiap Minggu._",
  ].join("\n");

  const result = await sendViaWablas(household.phone, message);

  await admin.from("activity_log").insert({
    actor_email: actorEmail,
    action: result.success ? "whatsapp.weekly_report" : "whatsapp.weekly_report_failed",
    detail: result.success
      ? `laporan mingguan -> ${household.phone} - ${result.detail}`
      : `laporan mingguan -> ${household.phone} - ${result.reason} - ${result.detail}`,
  });

  return result.success
    ? { success: true, detail: result.detail }
    : { success: false, reason: result.reason };
}
