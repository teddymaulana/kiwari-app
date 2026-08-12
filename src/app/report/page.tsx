import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Household, Payment } from "@/lib/types";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";

type UnitRow = { id: string; unit_no: string; label: string };
type PaidEntry = { household_id: string; period_month: number; amount: number };

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const currentMonth =
    year === now.getFullYear() ? now.getMonth() + 1 : null;

  const user = await getCurrentUser();
  const isPengurus = user?.role === "pengurus";

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

  const paidMap = new Map<string, number>();
  paidEntries.forEach((p) => {
    paidMap.set(`${p.household_id}-${p.period_month}`, p.amount);
  });

  const yearTotal = paidEntries.reduce((s, p) => s + p.amount, 0);

  // Kas Saat Ini is a running treasury balance, so it's all-time — not
  // scoped to the year picker above.
  const [{ data: allTimePayments }, { data: allExpenses }] = await Promise.all([
    isPengurus
      ? supabase.from("payments").select("amount").eq("status", "confirmed")
      : supabase.from("payments_public").select("amount"),
    supabase.from("expenses").select("amount"),
  ]);
  const totalIncome = (allTimePayments ?? []).reduce(
    (s, p) => s + Number(p.amount),
    0
  );
  const totalExpenses = (allExpenses ?? []).reduce(
    (s, e) => s + Number(e.amount),
    0
  );
  const kasSaatIni = totalIncome - totalExpenses;

  const monthlyStats = MONTH_NAMES.map((_, i) => {
    const month = i + 1;
    const entriesThisMonth = paidEntries.filter((p) => p.period_month === month);
    return {
      month,
      total: entriesThisMonth.reduce((s, p) => s + p.amount, 0),
      paidCount: new Set(entriesThisMonth.map((p) => p.household_id)).size,
    };
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-lg font-semibold text-gray-900">
          Laporan Tahunan {year}
        </h1>
        <div className="flex items-center gap-2">
          <form className="flex gap-2 items-center text-sm" action="/report">
            <input
              type="number"
              name="year"
              defaultValue={year}
              className="w-24 rounded border border-gray-300 px-2 py-1"
            />
            <button
              type="submit"
              className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50"
            >
              Lihat
            </button>
          </form>
          <a
            href={`/api/export?year=${year}`}
            className="text-sm rounded bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 transition"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Total Terkumpul {year}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatRupiah(yearTotal)}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Kas Saat Ini</p>
          <p
            className={`text-2xl font-semibold ${
              kasSaatIni < 0 ? "text-red-600" : "text-gray-900"
            }`}
          >
            {formatRupiah(kasSaatIni)}
          </p>
        </div>
      </div>

      {isPengurus ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium sticky left-0 bg-gray-50">
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
                  <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white">
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
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Bulan</th>
                <th className="px-3 py-2 font-medium">Total Terkumpul</th>
                <th className="px-3 py-2 font-medium">Rumah Bayar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monthlyStats.map((s) => (
                <tr
                  key={s.month}
                  className={s.month === currentMonth ? "bg-blue-50" : ""}
                >
                  <td className="px-3 py-2">{MONTH_NAMES[s.month - 1]}</td>
                  <td className="px-3 py-2">{formatRupiah(s.total)}</td>
                  <td
                    className={`px-3 py-2 ${
                      units.length > 0 && s.paidCount === units.length
                        ? "text-green-600 font-medium"
                        : ""
                    }`}
                  >
                    {s.paidCount} / {units.length}
                  </td>
                </tr>
              ))}
              {units.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
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
