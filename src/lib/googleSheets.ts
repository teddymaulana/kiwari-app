import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Household, Payment } from "@/lib/types";
import { compareUnitNo, MONTH_NAMES } from "@/lib/types";

// The yearly IPL table: one row per household, one column per month holding
// the confirmed (non-excluded) amount, plus a Total. Shared by the Laporan
// CSV export (/api/export) and the Google Sheets sync below so both always
// show exactly the same numbers.
export async function buildYearTable(
  supabase: SupabaseClient,
  year: number
): Promise<(string | number)[][]> {
  const [{ data: households }, { data: payments }] = await Promise.all([
    supabase.from("households").select("*").returns<Household[]>(),
    supabase
      .from("payments")
      .select("*")
      .eq("period_year", year)
      .eq("status", "confirmed")
      .eq("excluded", false)
      .returns<Payment[]>(),
  ]);

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  const paidMap = new Map<string, Payment>();
  (payments ?? []).forEach((p) => {
    paidMap.set(`${p.household_id}-${p.period_month}`, p);
  });

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const header = ["No. Rumah", "Nama", ...months.map((m) => MONTH_NAMES[m - 1]), "Total"];
  const rows = (households ?? []).map((h) => {
    let total = 0;
    const cells = months.map((m) => {
      const p = paidMap.get(`${h.id}-${m}`);
      if (!p) return "";
      total += Number(p.amount);
      return Number(p.amount);
    });
    return [h.unit_no, h.name, ...cells, total];
  });

  return [header, ...rows];
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
    const values = await buildYearTable(admin, year);
    // Apps Script answers a POST with a 302 to the script's output; fetch
    // follows it (as a GET) by default, and the write has already happened.
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, tab: String(year), values }),
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
