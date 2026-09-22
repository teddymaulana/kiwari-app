import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { sendViaWablas, WARGA_GROUP_ID } from "@/lib/wablas";
import { getKasSaatIni, getMonthlyReport, getUnpaidUnits } from "@/lib/kasSummary";
import { formatRupiah, MONTH_NAMES } from "@/lib/types";

// The WA group this report goes to (see WARGA_GROUP_ID in wablas.ts).
const REPORT_GROUP_ID = WARGA_GROUP_ID;

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

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [kasSaatIni, monthly, unpaidUnits] = await Promise.all([
    getKasSaatIni(),
    getMonthlyReport(year, month),
    getUnpaidUnits(year, month),
  ]);

  const paidPercent =
    monthly.totalUnits > 0
      ? Math.round((monthly.paidCount / monthly.totalUnits) * 100)
      : 0;

  const message = [
    `💰 *Kas Saat Ini*`,
    `*${formatRupiah(kasSaatIni.total)}*`,
    `  • Kas BRI: ${formatRupiah(kasSaatIni.bri)}`,
    `  • Petty Cash: ${formatRupiah(kasSaatIni.pettyCash)}`,
    "",
    `📊 *Laporan Bulan Ini (${MONTH_NAMES[month - 1]} ${year})*`,
    `Sampai tanggal ${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
    `✅ ${monthly.paidCount}/${monthly.totalUnits} Sudah bayar IPL (${paidPercent}%)`,
    `💵 Total Terkumpul: ${formatRupiah(monthly.totalTerkumpul)}`,
    `📉 Pengeluaran: ${formatRupiah(monthly.pengeluaran)}`,
    ...(unpaidUnits.length > 0
      ? ["", `❌ *Belum Bayar (${unpaidUnits.length}):*`, unpaidUnits.join(", ")]
      : []),
    "",
    "_Laporan otomatis, dikirim setiap Minggu._",
  ].join("\n");

  const result = await sendViaWablas(REPORT_GROUP_ID, message, true);

  await admin.from("activity_log").insert({
    actor_email: actorEmail,
    action: result.success ? "whatsapp.weekly_report" : "whatsapp.weekly_report_failed",
    detail: result.success
      ? `laporan mingguan -> ${REPORT_GROUP_ID} - ${result.detail}`
      : `laporan mingguan -> ${REPORT_GROUP_ID} - ${result.reason} - ${result.detail}`,
  });

  return result.success
    ? { success: true, detail: result.detail }
    : { success: false, reason: result.reason };
}
