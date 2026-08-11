import { createClient } from "@/lib/supabase/server";
import { updateMonthlyAmount } from "./actions";
import type { Settings } from "@/lib/types";
import { formatRupiah } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single<Settings>();

  const { data: log } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 mb-6">
          Pengaturan
        </h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-sm font-medium text-gray-700 mb-1">
            Nominal Iuran Bulanan
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Saat ini: {formatRupiah(settings?.monthly_amount ?? 0)}. Ini
            hanya dipakai sebagai nilai default saat mencatat pembayaran
            baru — tidak mengubah data yang sudah tercatat.
          </p>
          <form action={updateMonthlyAmount} className="flex gap-3">
            <input
              type="number"
              name="monthly_amount"
              step="1000"
              defaultValue={settings?.monthly_amount ?? 0}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
            >
              Simpan
            </button>
          </form>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          Riwayat Aktivitas
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {(log ?? []).map((l) => (
            <div key={l.id} className="px-4 py-2 text-xs text-gray-500">
              <span className="text-gray-400">
                {new Date(l.created_at).toLocaleString("id-ID")}
              </span>{" "}
              — {l.actor_email} — {l.action} {l.detail && `(${l.detail})`}
            </div>
          ))}
          {(log ?? []).length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-xs">
              Belum ada aktivitas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
