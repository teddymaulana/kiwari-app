import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { updateMonthlyAmount, createWargaUser } from "./actions";
import type { Household, Settings } from "@/lib/types";
import { formatRupiah } from "@/lib/types";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const { error, success } = await searchParams;

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

  const { data: households } = await supabase
    .from("households")
    .select("*")
    .eq("is_active", true)
    .order("unit_no")
    .returns<Household[]>();

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
        <h2 className="text-sm font-medium text-gray-700 mb-1">
          Tambah User Warga
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Akun ini hanya bisa melihat Dashboard dan Laporan (read-only).
          Untuk menjadikan pengurus, ubah role lewat SQL Editor (lihat
          README).
        </p>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            User warga berhasil dibuat.
          </div>
        )}

        <form
          action={createWargaUser}
          className="bg-white border border-gray-200 rounded-lg p-6 flex flex-wrap gap-3"
        >
          <input
            type="email"
            name="email"
            placeholder="Email"
            required
            className="flex-1 min-w-40 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            name="password"
            placeholder="Password (min. 6 karakter)"
            minLength={6}
            required
            className="flex-1 min-w-40 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="household_id"
            required
            defaultValue=""
            className="flex-1 min-w-40 rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Pilih rumah...
            </option>
            {(households ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.unit_no} - {h.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Buat User
          </button>
        </form>
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
