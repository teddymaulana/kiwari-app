import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Household, Payment } from "@/lib/types";
import { compareUnitNo, MONTH_NAMES } from "@/lib/types";

// The yearly IPL table: one row per household, one column per month holding
// the confirmed (non-excluded) amount, plus a Total. Shared by the Laporan
// CSV export (/api/export) and the Google Sheets sync below so both always
// show exactly the same numbers.
//
// markUnowed (sheet only): months that aren't owed get a label instead of
// staying empty — "Gratis" for an IPL exemption, "-" for an inactive unit —
// so the sheet's red "belum bayar" highlight only lands on real arrears.
export async function buildYearTable(
  supabase: SupabaseClient,
  year: number,
  { markUnowed = false }: { markUnowed?: boolean } = {}
): Promise<(string | number)[][]> {
  const [{ data: households }, payments, exemptions] = await Promise.all([
    supabase.from("households").select("*").returns<Household[]>(),
    fetchAll<Payment>((from, to) =>
      supabase
        .from("payments")
        .select("*")
        .eq("period_year", year)
        .eq("status", "confirmed")
        .eq("excluded", false)
        .order("id")
        .range(from, to)
    ),
    markUnowed
      ? fetchAll<{ household_id: string; period_month: number }>((from, to) =>
          supabase
            .from("ipl_exemptions")
            .select("household_id, period_month")
            .eq("period_year", year)
            .order("id")
            .range(from, to)
        )
      : Promise.resolve([]),
  ]);

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  const paidMap = new Map<string, Payment>();
  payments.forEach((p) => {
    paidMap.set(`${p.household_id}-${p.period_month}`, p);
  });
  const exempt = new Set(exemptions.map((e) => `${e.household_id}-${e.period_month}`));

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const header = ["No. Rumah", "Nama", ...months.map((m) => MONTH_NAMES[m - 1]), "Total"];
  const rows = (households ?? []).map((h) => {
    let total = 0;
    const cells = months.map((m) => {
      const p = paidMap.get(`${h.id}-${m}`);
      if (p) {
        total += Number(p.amount);
        return Number(p.amount);
      }
      if (markUnowed && exempt.has(`${h.id}-${m}`)) return "Gratis";
      if (markUnowed && !h.is_active) return "-";
      return "";
    });
    return [h.unit_no, h.name, ...cells, total];
  });

  return [header, ...rows];
}

// Supabase caps a single select at 1000 rows; a full year of payments
// (households x 12) goes past that, so page through until a short page.
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

// Months up to and including this one are due, so their empty cells are
// highlighted red in the sheet: all 12 for a past year, none for a future one.
function dueThroughMonth(year: number): number {
  const [y, m] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  if (year < y) return 12;
  if (year > y) return 0;
  return m;
}

// Rewrites the tab named after `year` (e.g. "2026") in a Google Sheet with
// the full yearly table. A full rewrite rather than patching one cell keeps
// the sheet self-healing: deletes, exclusions or a previously failed sync are
// all corrected by the next one.
//
// The write goes through a small Apps Script web app bound to the sheet
// (script in docs/google-sheets-sync.gs) — no Google Cloud project or
// billing account needed. GOOGLE_SHEETS_WEBHOOK_URL is the web app's /exec
// URL and GOOGLE_SHEETS_WEBHOOK_SECRET must match SECRET in the script.
// Silently does nothing when unconfigured. Meant to be called from `after()`
// so it never slows down or breaks the payment flow — failures are recorded
// in activity_log as "sheets.sync_failed".
export async function syncYearToSheet(year: number): Promise<void> {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;
  if (!url || !secret) return;

  const admin = createAdminClient();
  try {
    const values = await buildYearTable(admin, year, { markUnowed: true });
    // Apps Script answers a POST with a 302 to the script's output; fetch
    // follows it (as a GET) by default, and the write has already happened.
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        tab: String(year),
        values,
        dueThroughMonth: dueThroughMonth(year),
      }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok || text.trim() !== "ok") {
      throw new Error(`${res.status} ${text.slice(0, 300)}`);
    }
  } catch (err) {
    await admin.from("activity_log").insert({
      actor_email: "system",
      action: "sheets.sync_failed",
      detail: `${year} - ${err instanceof Error ? err.message : String(err)}`.slice(0, 500),
    });
  }
}
