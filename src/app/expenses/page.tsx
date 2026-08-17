import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { addExpense, deleteExpense } from "./actions";
import type { Expense } from "@/lib/types";
import { formatRupiah, KAS_LABELS, MONTH_NAMES } from "@/lib/types";

// Only 2026 data exists so far, so the year filter is locked instead of a
// free input — swap this back to an editable field once other years exist.
const YEAR = 2026;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = Number(sp.month) || null;

  const user = await getCurrentUser();
  const isPengurus = user?.role === "pengurus";

  const supabase = await createClient();
  const { data: yearExpenses } = await supabase
    .from("expenses")
    .select("*")
    .gte("expense_date", `${YEAR}-01-01`)
    .lte("expense_date", `${YEAR}-12-31`)
    .order("expense_date", { ascending: false })
    .returns<Expense[]>();

  const monthStr = month ? String(month).padStart(2, "0") : null;
  const expenses = monthStr
    ? (yearExpenses ?? []).filter((e) =>
        e.expense_date.startsWith(`${YEAR}-${monthStr}`)
      )
    : yearExpenses ?? [];

  const periodTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const periodLabel = month ? `${MONTH_NAMES[month - 1]} ${YEAR}` : `${YEAR}`;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-lg font-semibold text-gray-900">
          Pengeluaran {periodLabel}
        </h1>
        <form className="flex gap-2 items-center text-sm" action="/expenses">
          <select
            name="month"
            defaultValue={month ?? ""}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">Semua Bulan</option>
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-gray-500 w-20 text-center">
            {YEAR}
          </span>
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50"
          >
            Lihat
          </button>
        </form>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Total pengeluaran {periodLabel}: <strong>{formatRupiah(periodTotal)}</strong>
      </p>

      {isPengurus && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-sm font-medium text-gray-700 mb-4">
            Catat Pengeluaran
          </h2>
          <form action={addExpense} className="grid sm:grid-cols-5 gap-3">
            <input
              name="description"
              placeholder="Keterangan (mis. Bayar keamanan)"
              required
              className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              type="number"
              name="amount"
              placeholder="Jumlah (Rp)"
              required
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              name="expense_date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              name="kas_type"
              defaultValue="bri"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="bri">Kas BRI</option>
              <option value="tunai">Petty Cash</option>
            </select>
            <button
              type="submit"
              className="sm:col-span-5 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
            >
              Simpan
            </button>
          </form>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Tanggal</th>
              <th className="px-4 py-2 font-medium">Keterangan</th>
              <th className="px-4 py-2 font-medium">Jumlah</th>
              {isPengurus && <th className="px-4 py-2 font-medium">Kas</th>}
              {isPengurus && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(expenses ?? []).map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(e.expense_date).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-2">{e.description}</td>
                <td className="px-4 py-2 text-gray-500">
                  {formatRupiah(Number(e.amount))}
                </td>
                {isPengurus && (
                  <td className="px-4 py-2 text-gray-500">
                    {KAS_LABELS[e.kas_type]}
                  </td>
                )}
                {isPengurus && (
                  <td className="px-4 py-2 text-right">
                    <form action={deleteExpense.bind(null, e.id)}>
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:text-red-700 transition"
                      >
                        Hapus
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {(expenses ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={isPengurus ? 5 : 3}
                  className="px-4 py-6 text-center text-gray-400"
                >
                  Belum ada pengeluaran tercatat {month ? "bulan ini" : "tahun ini"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
