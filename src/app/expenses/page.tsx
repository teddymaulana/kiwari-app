import { Fragment } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, EXPENSE_RECORDERS } from "@/lib/auth";
import { addExpense, deleteExpense, releaseExpense, releaseAllDrafts } from "./actions";
import DeleteExpenseButton from "./DeleteExpenseButton";
import KeteranganCell from "./KeteranganCell";
import ReleaseAllDraftsButton from "./ReleaseAllDraftsButton";
import SubmitButton from "@/components/SubmitButton";
import type { Expense } from "@/lib/types";
import { formatRupiah, KAS_LABELS, EXPENSE_STATUS_LABELS, MONTH_NAMES } from "@/lib/types";

// Only 2026 data exists so far, so the year filter is locked instead of a
// free input — swap this back to an editable field once other years exist.
const YEAR = 2026;

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; draft?: string }>;
}) {
  const user = await getCurrentUser();
  // Pengurus-only — warga get the same per-month totals on Laporan
  // (/report) instead, without the itemized/draft-review detail here.
  if (user?.role !== "pengurus") redirect("/report");

  const sp = await searchParams;
  const month = Number(sp.month) || null;
  const draftOnly = sp.draft === "1";

  const supabase = await createClient();
  const { data: yearExpenses } = await supabase
    .from("expenses")
    .select("*")
    .gte("expense_date", `${YEAR}-01-01`)
    .lte("expense_date", `${YEAR}-12-31`)
    .order("expense_date", { ascending: false })
    .returns<Expense[]>();

  const monthStr = month ? String(month).padStart(2, "0") : null;
  const expenses = (yearExpenses ?? [])
    .filter((e) => !monthStr || e.expense_date.startsWith(`${YEAR}-${monthStr}`))
    .filter((e) => !draftOnly || e.status === "draft");

  const periodTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const periodLabel = month ? `${MONTH_NAMES[month - 1]} ${YEAR}` : `${YEAR}`;
  const draftIds = expenses.filter((e) => e.status === "draft").map((e) => e.id);

  const monthTotals = new Map<number, number>();
  expenses.forEach((e) => {
    const m = Number(e.expense_date.slice(5, 7));
    monthTotals.set(m, (monthTotals.get(m) ?? 0) + Number(e.amount));
  });

  const admin = createAdminClient();
  const receiptUrls = new Map<string, string>();
  await Promise.all(
    expenses
      .filter((e) => e.receipt_path)
      .map(async (e) => {
        const { data } = await admin.storage
          .from("bukti-pengeluaran")
          .createSignedUrl(e.receipt_path!, 60 * 10);
        if (data?.signedUrl) receiptUrls.set(e.id, data.signedUrl);
      })
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-lg font-semibold text-gray-900">
          Pengeluaran {periodLabel}
        </h1>
        <form className="flex gap-2 items-center text-sm" action="/expenses">
          {draftOnly && <input type="hidden" name="draft" value="1" />}
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

      {EXPENSE_RECORDERS.includes(user.email) && (
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
            <div className="sm:col-span-5">
              <label className="block text-xs text-gray-500 mb-1">
                Bukti Pengeluaran (opsional)
              </label>
              <input
                type="file"
                name="receipt"
                accept="image/*"
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-100 file:text-sm file:text-gray-700"
              />
            </div>
            <SubmitButton
              pendingText="Menyimpan..."
              className="sm:col-span-5 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
            >
              Simpan
            </SubmitButton>
          </form>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <a
          href={`/expenses?${month ? `month=${month}&` : ""}${
            draftOnly ? "" : "draft=1"
          }`}
          className={
            draftOnly
              ? "text-sm rounded bg-gray-700 text-white px-3 py-1.5 hover:bg-gray-800 transition"
              : "text-sm rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-50 transition"
          }
        >
          {draftOnly ? "Tampilkan Semua" : "Draft Saja"}
        </a>
        <ReleaseAllDraftsButton action={releaseAllDrafts} ids={draftIds} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Tanggal</th>
              <th className="px-4 py-2 font-medium">Keterangan</th>
              <th className="px-4 py-2 font-medium">Jumlah</th>
              <th className="px-4 py-2 font-medium">Kas</th>
              <th className="px-4 py-2 font-medium">Bukti</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(expenses ?? []).map((e, i) => {
              const monthNum = Number(e.expense_date.slice(5, 7));
              const prevMonthNum =
                i > 0 ? Number(expenses[i - 1].expense_date.slice(5, 7)) : null;
              const showMonthDivider = !month && monthNum !== prevMonthNum;
              return (
                <Fragment key={e.id}>
                  {showMonthDivider && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-1.5 bg-gray-200 text-xs font-semibold text-gray-700 uppercase tracking-wide"
                      >
                        {MONTH_NAMES[monthNum - 1]} —{" "}
                        {formatRupiah(monthTotals.get(monthNum) ?? 0)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(e.expense_date).toLocaleDateString("id-ID")}
                    </td>
                    <KeteranganCell text={e.description} />
                    <td className="px-4 py-2 text-gray-500">
                      {formatRupiah(Number(e.amount))}
                    </td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                      {KAS_LABELS[e.kas_type]}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {receiptUrls.has(e.id) ? (
                        <a
                          href={receiptUrls.get(e.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 transition"
                        >
                          Lihat
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          e.status === "released"
                            ? "text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5"
                            : "text-xs rounded-full bg-gray-100 text-gray-500 px-2 py-0.5"
                        }
                      >
                        {EXPENSE_STATUS_LABELS[e.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {e.status === "draft" && (
                        <form action={releaseExpense.bind(null, e.id)}>
                          <SubmitButton
                            pendingText="Merilis..."
                            className="text-xs text-blue-600 hover:text-blue-700 transition"
                          >
                            Rilis ke Warga
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {EXPENSE_RECORDERS.includes(user.email) && (
                        <DeleteExpenseButton
                          action={deleteExpense.bind(null, e.id)}
                          description={e.description}
                        />
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {(expenses ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  {draftOnly
                    ? `Tidak ada pengeluaran draft ${month ? "bulan ini" : "tahun ini"}.`
                    : `Belum ada pengeluaran tercatat ${month ? "bulan ini" : "tahun ini"}.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
