import { createClient } from "@/lib/supabase/server";
import { recordPayment } from "./actions";
import type { Household, Settings } from "@/lib/types";
import { MONTH_NAMES } from "@/lib/types";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: households }, { data: settings }] = await Promise.all([
    supabase
      .from("households")
      .select("*")
      .eq("is_active", true)
      .order("unit_no")
      .returns<Household[]>(),
    supabase.from("settings").select("*").eq("id", 1).single<Settings>(),
  ]);

  const now = new Date();

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-6">
        Catat Pembayaran Iuran
      </h1>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <form
        action={recordPayment}
        className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Warga
          </label>
          <select
            name="household_id"
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Pilih warga...</option>
            {(households ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.unit_no} - {h.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bulan
            </label>
            <select
              name="period_month"
              defaultValue={now.getMonth() + 1}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tahun
            </label>
            <input
              type="number"
              name="period_year"
              defaultValue={now.getFullYear()}
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Jumlah (Rp)
          </label>
          <input
            type="number"
            name="amount"
            step="1000"
            defaultValue={settings?.monthly_amount ?? 50000}
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tanggal Bayar
          </label>
          <input
            type="date"
            name="paid_date"
            defaultValue={now.toISOString().slice(0, 10)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Catatan (opsional)
          </label>
          <input
            name="note"
            placeholder="mis. transfer BCA"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition"
        >
          Simpan
        </button>
      </form>
    </div>
  );
}
