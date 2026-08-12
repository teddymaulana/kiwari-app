import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { addExpense } from "./actions";
import type { Expense } from "@/lib/types";
import { formatRupiah } from "@/lib/types";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();

  const user = await getCurrentUser();
  const isPengurus = user?.role === "pengurus";

  const supabase = await createClient();
  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .gte("expense_date", `${year}-01-01`)
    .lte("expense_date", `${year}-12-31`)
    .order("expense_date", { ascending: false })
    .returns<Expense[]>();

  const yearTotal = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-lg font-semibold text-gray-900">
          Pengeluaran {year}
        </h1>
        <form className="flex gap-2 items-center text-sm" action="/expenses">
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
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Total pengeluaran {year}: <strong>{formatRupiah(yearTotal)}</strong>
      </p>

      {isPengurus && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-sm font-medium text-gray-700 mb-4">
            Catat Pengeluaran
          </h2>
          <form action={addExpense} className="grid sm:grid-cols-4 gap-3">
            <input
              name="description"
              placeholder="Keterangan (mis. Bayar keamanan)"
              required
              className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              type="number"
              name="amount"
              step="1000"
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
            <button
              type="submit"
              className="sm:col-span-4 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
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
              {isPengurus && (
                <th className="px-4 py-2 font-medium">Dicatat oleh</th>
              )}
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
                    {e.recorded_by}
                  </td>
                )}
              </tr>
            ))}
            {(expenses ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={isPengurus ? 4 : 3}
                  className="px-4 py-6 text-center text-gray-400"
                >
                  Belum ada pengeluaran tercatat tahun ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
