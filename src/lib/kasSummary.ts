import { createAdminClient } from "@/lib/supabase/admin";
import type { KasType } from "@/lib/types";

// Backend-job version of the ledger math in src/app/report/page.tsx (the
// isPengurus/full-data branch, ~lines 109-209) — always reads the private
// tables via the admin client since there's no signed-in role here. Keep
// this in sync if that formula changes (new kas-affecting table, etc).
// Deliberately excludes PENDING_DANA_BU_YANE / SISA_KAS_THR_HALBIL_KURBAN
// (report/page.tsx) — those are only shown in the pengurus Cash breakdown,
// not part of Kas Saat Ini itself.
export async function getKasSaatIni(): Promise<number> {
  const admin = createAdminClient();

  const [
    { data: payments },
    { data: contributions },
    { data: expenses },
    { data: transfers },
    { data: loans },
    { data: settings },
  ] = await Promise.all([
    admin
      .from("payments")
      .select("amount, kas_type")
      .eq("status", "confirmed")
      .eq("excluded", false),
    admin.from("contributions").select("amount, kas_type").eq("excluded", false),
    admin.from("expenses").select("amount, kas_type"),
    admin.from("cash_transfers").select("amount, direction"),
    admin
      .from("personnel_loans")
      .select("amount, kas_type, transaction_type, affects_kas"),
    admin
      .from("settings")
      .select("opening_balance_tunai, opening_balance_bri")
      .eq("id", 1)
      .single<{ opening_balance_tunai: number; opening_balance_bri: number }>(),
  ]);

  const kasBalance: Record<KasType, number> = {
    tunai: Number(settings?.opening_balance_tunai ?? 0),
    bri: Number(settings?.opening_balance_bri ?? 0),
  };
  (payments ?? []).forEach((p) => {
    kasBalance[p.kas_type as KasType] += Number(p.amount);
  });
  (contributions ?? []).forEach((c) => {
    kasBalance[c.kas_type as KasType] += Number(c.amount);
  });
  (expenses ?? []).forEach((e) => {
    kasBalance[e.kas_type as KasType] -= Number(e.amount);
  });
  (transfers ?? []).forEach((t) => {
    const amount = Number(t.amount);
    if (t.direction === "bri_to_tunai") {
      kasBalance.bri -= amount;
      kasBalance.tunai += amount;
    } else {
      kasBalance.tunai -= amount;
      kasBalance.bri += amount;
    }
  });

  let piutangPersonel = 0;
  (loans ?? []).forEach((l) => {
    const amount = Number(l.amount);
    if (l.transaction_type === "pinjam") {
      if (l.affects_kas) kasBalance[l.kas_type as KasType] -= amount;
      piutangPersonel += amount;
    } else {
      if (l.affects_kas) kasBalance[l.kas_type as KasType] += amount;
      piutangPersonel -= amount;
    }
  });

  return kasBalance.tunai + piutangPersonel + kasBalance.bri;
}

export type MonthlyReport = {
  totalUnits: number;
  paidCount: number;
  totalTerkumpul: number;
  pengeluaran: number;
};

// Backend-job version of the per-month figures in src/app/report/page.tsx
// (monthlyStats, ~lines 245-278) for a single month — full data, no
// status filter on expenses, matching the pengurus view there.
export async function getMonthlyReport(
  year: number,
  month: number
): Promise<MonthlyReport> {
  const admin = createAdminClient();
  const monthStr = String(month).padStart(2, "0");

  const [{ data: households }, { data: payments }, { data: contributions }, { data: expenses }] =
    await Promise.all([
      admin.from("households").select("id").eq("is_active", true),
      admin
        .from("payments")
        .select("household_id, amount")
        .eq("period_year", year)
        .eq("period_month", month)
        .eq("status", "confirmed")
        .eq("excluded", false),
      admin
        .from("contributions")
        .select("amount, contribution_date")
        .eq("excluded", false),
      admin.from("expenses").select("amount, expense_date"),
    ]);

  const iplTotal = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const contributionTotal = (contributions ?? [])
    .filter((c) => c.contribution_date?.startsWith(`${year}-${monthStr}`))
    .reduce((s, c) => s + Number(c.amount), 0);
  const pengeluaran = (expenses ?? [])
    .filter((e) => e.expense_date?.startsWith(`${year}-${monthStr}`))
    .reduce((s, e) => s + Number(e.amount), 0);

  return {
    totalUnits: households?.length ?? 0,
    paidCount: new Set((payments ?? []).map((p) => p.household_id)).size,
    totalTerkumpul: iplTotal + contributionTotal,
    pengeluaran,
  };
}
