import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Household, KasType, Payment, Settings } from "@/lib/types";
import { MONTH_NAMES, formatRupiah, KAS_LABELS, compareUnitNo } from "@/lib/types";
import ReportTabs from "./ReportTabs";
import ScrollRight from "./ScrollRight";

type UnitRow = { id: string; unit_no: string; label: string };
type PaidEntry = { household_id: string; period_month: number; amount: number };

// Only 2026 data exists so far, so the year filter is locked instead of a
// free input — swap this back to an editable field once other years exist.
const YEAR = 2026;

// Dana pending with Bu Yane (a previous pengurus) — not backed by any
// payments/expenses/cash_transfers row, so it's hardcoded here rather than
// modeled in the DB. Only shown in the pengurus-only Cash breakdown below
// (Petty Cash's displayed total and Kas Saat Ini are unaffected by it).
const PENDING_DANA_BU_YANE = 1_000_000;

// Leftover cash from the THR/Halal bi Halal + Kurban events — held
// separately from day-to-day Petty Cash, same treatment as
// PENDING_DANA_BU_YANE above.
const SISA_KAS_THR_HALBIL_KURBAN = 458_000;

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = YEAR;
  const currentMonth =
    year === now.getFullYear() ? now.getMonth() + 1 : null;

  const user = await getCurrentUser();
  const isPengurus = user?.role === "pengurus";
  // Warga always land on a specific month (defaulting to the current one)
  // — only pengurus can pick "Semua Bulan".
  const selectedMonth = Number(sp.month) || (isPengurus ? null : currentMonth);

  const supabase = await createClient();

  let units: UnitRow[];
  let paidEntries: PaidEntry[];

  if (isPengurus) {
    // Pengurus sees full household detail — same as before.
    const [{ data: households }, { data: payments }] = await Promise.all([
      supabase
        .from("households")
        .select("*")
        .order("unit_no")
        .returns<Household[]>(),
      supabase
        .from("payments")
        .select("*")
        .eq("period_year", year)
        .eq("status", "confirmed")
        .eq("excluded", false)
        .returns<Payment[]>(),
    ]);
    units = (households ?? []).map((h) => ({
      id: h.id,
      unit_no: h.unit_no,
      label: `${h.unit_no} - ${h.name}`,
    }));
    paidEntries = (payments ?? []).map((p) => ({
      household_id: p.household_id,
      period_month: p.period_month,
      amount: Number(p.amount),
    }));
  } else {
    // Warga sees every unit for community-wide transparency, but only
    // through views that never expose names/phone numbers/notes — see
    // households_public / payments_public in schema.sql.
    const [{ data: households }, { data: payments }] = await Promise.all([
      supabase
        .from("households_public")
        .select("id, unit_no")
        .order("unit_no")
        .returns<{ id: string; unit_no: string }[]>(),
      supabase
        .from("payments_public")
        .select("household_id, period_month, amount")
        .eq("period_year", year)
        .returns<PaidEntry[]>(),
    ]);
    units = (households ?? []).map((h) => ({
      id: h.id,
      unit_no: h.unit_no,
      label: h.unit_no,
    }));
    paidEntries = payments ?? [];
  }

  units.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  const paidMap = new Map<string, number>();
  paidEntries.forEach((p) => {
    paidMap.set(`${p.household_id}-${p.period_month}`, p.amount);
  });

  const yearTotal = paidEntries.reduce((s, p) => s + p.amount, 0);

  // Kas Saat Ini is a running treasury balance, so it's all-time — not
  // scoped to the year picker above. Split by kas_type (Petty Cash vs Kas
  // BRI) and adjusted for internal transfers between the two (see
  // cash_transfers in schema.sql) — a withdrawal from BRI to top up petty
  // cash moves the split without changing the total. Contributions
  // (Sumbangan — one-off income beyond the monthly IPL) count toward the
  // balance the same way payments do.
  const [
    { data: allTimePayments },
    { data: allContributions },
    { data: allExpenses },
    { data: allTransfers },
    { data: allLoans },
    { data: settings },
  ] = await Promise.all([
    isPengurus
      ? supabase
          .from("payments")
          .select("amount, kas_type")
          .eq("status", "confirmed")
          .eq("excluded", false)
      : supabase.from("payments_public").select("amount, kas_type"),
    isPengurus
      ? supabase
          .from("contributions")
          .select("amount, kas_type, contribution_date, event_name, household_id")
          .eq("excluded", false)
          .order("contribution_date", { ascending: true })
      : supabase
          .from("contributions_public")
          .select("amount, kas_type, contribution_date, event_name, household_id")
          .order("contribution_date", { ascending: true }),
    isPengurus
      ? supabase.from("expenses").select("amount, kas_type, expense_date")
      : supabase
          .from("expenses")
          .select("amount, kas_type, expense_date")
          .eq("status", "released"),
    supabase.from("cash_transfers").select("amount, direction"),
    isPengurus
      ? supabase
          .from("personnel_loans")
          .select("amount, kas_type, transaction_type, affects_kas")
      : supabase
          .from("personnel_loans_public")
          .select("amount, kas_type, transaction_type, affects_kas"),
    supabase.from("settings").select("*").eq("id", 1).single<Settings>(),
  ]);

  const kasBalance: Record<KasType, number> = {
    tunai: Number(settings?.opening_balance_tunai ?? 0),
    bri: Number(settings?.opening_balance_bri ?? 0),
  };
  (allTimePayments ?? []).forEach((p) => {
    kasBalance[p.kas_type as KasType] += Number(p.amount);
  });
  (allContributions ?? []).forEach((c) => {
    kasBalance[c.kas_type as KasType] += Number(c.amount);
  });
  (allExpenses ?? []).forEach((e) => {
    kasBalance[e.kas_type as KasType] -= Number(e.amount);
  });
  (allTransfers ?? []).forEach((t) => {
    const amount = Number(t.amount);
    if (t.direction === "bri_to_tunai") {
      kasBalance.bri -= amount;
      kasBalance.tunai += amount;
    } else {
      kasBalance.tunai -= amount;
      kasBalance.bri += amount;
    }
  });
  // Loans to personnel are normally real cash leaving/returning to the kas
  // (same as an expense) — except a backfilled loan that predates this
  // app's tracking (affects_kas = false), which already left the kas
  // before any opening balance/expense was recorded here and would
  // double-subtract if applied again. The outstanding balance itself is
  // added into Kas Saat Ini's grand total below (it isn't tied to a
  // specific kas_type — a receivable, not cash sitting in either Petty
  // Cash or Kas BRI — so it's kept out of the tunai/bri breakdown lines
  // and only folded in at the kasSaatIni sum).
  // Warga read personnel_loans_public (amount/kas_type/transaction_type/
  // affects_kas only — no person_name) instead of the pengurus-only base
  // table, so this kas-balance effect is now identical for both roles;
  // only the row-level "who borrowed what" detail stays pengurus-only.
  let piutangPersonel = 0;
  (allLoans ?? []).forEach((l) => {
    const amount = Number(l.amount);
    if (l.transaction_type === "pinjam") {
      if (l.affects_kas) kasBalance[l.kas_type as KasType] -= amount;
      piutangPersonel += amount;
    } else {
      if (l.affects_kas) kasBalance[l.kas_type as KasType] += amount;
      piutangPersonel -= amount;
    }
  });
  // Petty Cash here matches the displayed line below exactly (kasBalance.
  // tunai + piutangPersonel) — Kas Saat Ini is always exactly this plus
  // Kas BRI.
  const pettyCash = kasBalance.tunai + piutangPersonel;
  const kasSaatIni = pettyCash + kasBalance.bri;

  // Every Sumbangan this year, warga-linked or external (Lain-lain, e.g.
  // "Sumbangan Developer") — all of it counts toward Total Terkumpul.
  const contributionsThisYear = (allContributions ?? []).filter((c) =>
    c.contribution_date?.startsWith(String(year))
  );

  // Distinct acara this year, in the order they first appear (fetched
  // oldest-first) — shown as separate lines in the IPL/Sumbangan card.
  const contributionEventNames: string[] = [];
  const contributionByEvent = new Map<string, number>();
  contributionsThisYear.forEach((c) => {
    if (!contributionEventNames.includes(c.event_name)) {
      contributionEventNames.push(c.event_name);
    }
    contributionByEvent.set(
      c.event_name,
      (contributionByEvent.get(c.event_name) ?? 0) + Number(c.amount)
    );
  });

  // "Total Terkumpul" is everything collected this year — IPL plus every
  // acara (THR, Sumbangan, Lain-lain, ...) — shown as one figure with each
  // source broken out below it.
  const totalTerkumpul =
    yearTotal + contributionsThisYear.reduce((s, c) => s + Number(c.amount), 0);

  const expensesThisYear = (allExpenses ?? []).filter((e) =>
    e.expense_date?.startsWith(String(year))
  );
  const expenseYearTotal = expensesThisYear.reduce(
    (s, e) => s + Number(e.amount),
    0
  );

  const monthlyStats = MONTH_NAMES.map((_, i) => {
    const month = i + 1;
    const entriesThisMonth = paidEntries.filter((p) => p.period_month === month);
    const monthStr = String(month).padStart(2, "0");
    const expensesThisMonth = expensesThisYear.filter((e) =>
      e.expense_date?.startsWith(`${year}-${monthStr}`)
    );
    // Contributions (Sumbangan/THR) dated within this calendar month,
    // aggregated per acara — "Total Terkumpul" per month is IPL plus
    // these, so e.g. Agustus shows both IPL Agustus and Sumbangan
    // Agustusan 2026 together instead of one line per household.
    const contributionTotalsThisMonth = new Map<string, number>();
    contributionsThisYear
      .filter((c) => c.contribution_date?.startsWith(`${year}-${monthStr}`))
      .forEach((c) => {
        contributionTotalsThisMonth.set(
          c.event_name,
          (contributionTotalsThisMonth.get(c.event_name) ?? 0) + Number(c.amount)
        );
      });
    const iplTotal = entriesThisMonth.reduce((s, p) => s + p.amount, 0);
    const contributionTotal = Array.from(
      contributionTotalsThisMonth.values()
    ).reduce((s, amount) => s + amount, 0);
    return {
      month,
      iplTotal,
      contributionTotal,
      total: iplTotal + contributionTotal,
      contributions: Array.from(contributionTotalsThisMonth.entries()),
      paidCount: new Set(entriesThisMonth.map((p) => p.household_id)).size,
      pengeluaran: expensesThisMonth.reduce((s, e) => s + Number(e.amount), 0),
    };
  });

  const openingBalanceTotal =
    Number(settings?.opening_balance_bri ?? 0) +
    Number(settings?.opening_balance_tunai ?? 0);

  // When a month is picked, the "Total Terkumpul" / "Total Pengeluaran"
  // cards narrow to that month's figures (reusing the per-month numbers
  // already computed above) instead of the whole year.
  const selectedMonthStats = selectedMonth ? monthlyStats[selectedMonth - 1] : null;
  const cardIplTotal = selectedMonthStats ? selectedMonthStats.iplTotal : yearTotal;
  const cardContributions = selectedMonthStats
    ? selectedMonthStats.contributions
    : contributionEventNames.map(
        (ev) => [ev, contributionByEvent.get(ev) ?? 0] as [string, number]
      );
  const cardTotalTerkumpul = selectedMonthStats
    ? selectedMonthStats.total
    : totalTerkumpul;
  const cardExpenseTotal = selectedMonthStats
    ? selectedMonthStats.pengeluaran
    : expenseYearTotal;
  const periodLabel = selectedMonth
    ? `${MONTH_NAMES[selectedMonth - 1]} ${year}`
    : `${year}`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            Laporan Tahunan {year}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Saldo Awal {year}: {formatRupiah(openingBalanceTotal)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form className="flex gap-2 items-center text-sm" action="/report">
            <select
              name="month"
              defaultValue={selectedMonth ?? ""}
              className="rounded border border-gray-300 px-2 py-1"
            >
              {isPengurus && <option value="">Semua Bulan</option>}
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-500 w-20 text-center">
              {year}
            </span>
            <button
              type="submit"
              className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50"
            >
              Lihat
            </button>
          </form>
          {isPengurus && (
            <a
              href={`/api/export?year=${year}`}
              className="text-sm rounded bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 transition"
            >
              Export CSV
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 w-full">
          <p className="text-xs text-gray-500 mb-1">Kas Saat Ini</p>
          <p
            className={`text-2xl font-semibold ${
              kasSaatIni < 0 ? "text-red-600" : "text-emerald-600"
            }`}
          >
            {formatRupiah(kasSaatIni)}
          </p>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{KAS_LABELS.bri}</span>
              <span className={kasBalance.bri < 0 ? "text-red-600" : "text-gray-700"}>
                {formatRupiah(kasBalance.bri)}
              </span>
            </div>
            {/* Petty Cash here is the total book value — physical cash
                plus the outstanding Piutang Personel receivable — not
                just kasBalance.tunai on its own. */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{KAS_LABELS.tunai}</span>
              <span className={pettyCash < 0 ? "text-red-600" : "text-gray-700"}>
                {formatRupiah(pettyCash)}
              </span>
            </div>
            {/* Decomposes Petty Cash for pengurus: Piutang Personel is
                already folded into the Petty Cash total above, and money
                held separately from day-to-day cash (Bu Yane, THR/Kurban
                leftovers) is hardcoded — Cash is what's really physically
                on hand once both are backed out. Pengurus-only since
                warga only need the Petty Cash total, not this internal
                reconciliation. */}
            {isPengurus && (
              <div className="ml-2 pl-2 border-l-2 border-gray-100 space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Cash</span>
                  <span>
                    {formatRupiah(
                      kasBalance.tunai -
                        PENDING_DANA_BU_YANE -
                        SISA_KAS_THR_HALBIL_KURBAN
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>
                    Piutang Personel —{" "}
                    <a href="/piutang" className="text-blue-600 hover:underline">
                      lihat
                    </a>
                  </span>
                  <span>{formatRupiah(piutangPersonel)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Pending di Bu Yane</span>
                  <span>{formatRupiah(PENDING_DANA_BU_YANE)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Sisa Kas THR Halbil + Kurban</span>
                  <span>{formatRupiah(SISA_KAS_THR_HALBIL_KURBAN)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 w-full">
          <p className="text-xs text-gray-500 mb-1">Total Terkumpul {periodLabel}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatRupiah(cardTotalTerkumpul)}
          </p>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
            <div className="flex items-center justify-between text-xs gap-3">
              <span className="text-gray-500">IPL {periodLabel}</span>
              <span className="text-gray-700 whitespace-nowrap">
                {formatRupiah(cardIplTotal)}
              </span>
            </div>
            {cardContributions.map(([ev, amount]) => (
              <div key={ev} className="flex items-center justify-between text-xs gap-3">
                <span className="text-gray-500">{ev}</span>
                <span className="text-gray-700 whitespace-nowrap">
                  {formatRupiah(amount)}
                </span>
              </div>
            ))}
            {cardContributions.length === 0 && (
              <p className="text-xs text-gray-400">
                Belum ada sumbangan {periodLabel}.
              </p>
            )}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 w-full">
          <p className="text-xs text-gray-500 mb-1">Total Pengeluaran {periodLabel}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatRupiah(cardExpenseTotal)}
          </p>
          <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100">
            {isPengurus && (
              <a
                href="/expenses"
                className="text-blue-600 hover:underline"
              >
                Lihat detail
              </a>
            )}
          </p>
        </div>
      </div>

      {isPengurus ? (
        <ReportTabs
          checklistTable={
            <ScrollRight className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium sticky left-0 bg-gray-50 max-w-[180px]">
                      Warga
                    </th>
                    {MONTH_NAMES.map((m) => (
                      <th key={m} className="px-2 py-2 font-medium text-center">
                        {m.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {units.map((u) => (
                    <tr key={u.id}>
                      <td
                        className="px-3 py-2 whitespace-nowrap overflow-hidden text-ellipsis sticky left-0 bg-white max-w-[180px]"
                        title={u.label}
                      >
                        {u.label}
                      </td>
                      {MONTH_NAMES.map((_, i) => {
                        const paid = paidMap.has(`${u.id}-${i + 1}`);
                        return (
                          <td key={i} className="px-2 py-2 text-center">
                            <span
                              className={paid ? "text-green-600" : "text-gray-300"}
                            >
                              {paid ? "✓" : "·"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {units.length === 0 && (
                    <tr>
                      <td
                        colSpan={13}
                        className="px-3 py-6 text-center text-gray-400"
                      >
                        Belum ada data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ScrollRight>
          }
          monthlyTable={
            <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Bulan</th>
                    <th className="px-3 py-2 font-medium">Total Terkumpul</th>
                    <th className="px-3 py-2 font-medium">Rumah Bayar</th>
                    <th className="px-3 py-2 font-medium">Pengeluaran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {monthlyStats.map((s) => (
                    <tr
                      key={s.month}
                      className={s.month === currentMonth ? "bg-blue-50" : ""}
                    >
                      <td className="px-3 py-2">{MONTH_NAMES[s.month - 1]}</td>
                      <td className="px-3 py-2">
                        {formatRupiah(s.total)}
                        {s.contributions.length > 0 && (
                          <div className="mt-1 space-y-0.5 text-xs text-gray-400">
                            <div>IPL: {formatRupiah(s.iplTotal)}</div>
                            {s.contributions.map(([eventName, amount]) => (
                              <div key={eventName}>
                                {eventName}: {formatRupiah(amount)}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 ${
                          units.length > 0 && s.paidCount === units.length
                            ? "text-green-600 font-medium"
                            : ""
                        }`}
                      >
                        {s.paidCount} / {units.length}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {formatRupiah(s.pengeluaran)}
                      </td>
                    </tr>
                  ))}
                  {units.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-6 text-center text-gray-400"
                      >
                        Belum ada data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          }
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Bulan</th>
                <th className="px-3 py-2 font-medium">Total Terkumpul</th>
                <th className="px-3 py-2 font-medium">Rumah Bayar</th>
                <th className="px-3 py-2 font-medium">Pengeluaran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monthlyStats.map((s) => (
                <tr
                  key={s.month}
                  className={s.month === currentMonth ? "bg-blue-50" : ""}
                >
                  <td className="px-3 py-2">{MONTH_NAMES[s.month - 1]}</td>
                  <td className="px-3 py-2">
                    {formatRupiah(s.total)}
                    {s.contributions.length > 0 && (
                      <div className="mt-1 space-y-0.5 text-xs text-gray-400">
                        <div>IPL: {formatRupiah(s.iplTotal)}</div>
                        {s.contributions.map(([eventName, amount]) => (
                          <div key={eventName}>
                            {eventName}: {formatRupiah(amount)}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 ${
                      units.length > 0 && s.paidCount === units.length
                        ? "text-green-600 font-medium"
                        : ""
                    }`}
                  >
                    {s.paidCount} / {units.length}
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {formatRupiah(s.pengeluaran)}
                  </td>
                </tr>
              ))}
              {units.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-gray-400"
                  >
                    Belum ada data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
