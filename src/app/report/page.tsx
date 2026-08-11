import { createClient } from "@/lib/supabase/server";
import type { Household, Payment } from "@/lib/types";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();

  const supabase = await createClient();
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
      .returns<Payment[]>(),
  ]);

  const paidMap = new Map<string, Payment>();
  (payments ?? []).forEach((p) => {
    paidMap.set(`${p.household_id}-${p.period_month}`, p);
  });

  const yearTotal = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);

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

      <p className="text-sm text-gray-500 mb-4">
        Total terkumpul {year}: <strong>{formatRupiah(yearTotal)}</strong>
      </p>

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
            {(households ?? []).map((h) => (
              <tr key={h.id}>
                <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white">
                  {h.unit_no} - {h.name}
                </td>
                {MONTH_NAMES.map((_, i) => {
                  const paid = paidMap.has(`${h.id}-${i + 1}`);
                  return (
                    <td key={i} className="px-2 py-2 text-center">
                      <span
                        className={
                          paid ? "text-green-600" : "text-gray-300"
                        }
                      >
                        {paid ? "✓" : "·"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {(households ?? []).length === 0 && (
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
    </div>
  );
}
