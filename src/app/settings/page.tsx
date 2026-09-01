import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  CASH_TRANSFER_RECORDERS,
  WHATSAPP_TEST_SENDERS,
  WHATSAPP_PROVIDER_MANAGERS,
  WEEKLY_REPORT_SENDERS,
} from "@/lib/auth";
import {
  updateOpeningBalance,
  createWargaUser,
  sendTestWhatsApp,
  recordCashTransfer,
  setWhatsAppProvider,
  sendWeeklyReportNow,
} from "./actions";
import type { Household, Settings } from "@/lib/types";
import { formatRupiah, compareUnitNo } from "@/lib/types";
import HouseholdSelect from "@/components/HouseholdSelect";
import SubmitButton from "@/components/SubmitButton";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    wa_error?: string;
    wa_success?: string;
    kas_error?: string;
    kas_success?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const { error, success, wa_error, wa_success, kas_error, kas_success } =
    await searchParams;

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
    .returns<Household[]>();

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

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
            Saat ini: {formatRupiah(settings?.monthly_amount ?? 0)}. Nilai
            ini dikunci dan tidak bisa diubah dari sini.
          </p>
          <input
            type="text"
            disabled
            value={formatRupiah(settings?.monthly_amount ?? 0)}
            className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          />
        </div>
      </div>

      {CASH_TRANSFER_RECORDERS.includes(user.email) && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-1">
            Transfer Kas
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Catat perpindahan uang antar kas — mis. tarik tunai dari Kas BRI
            untuk mengisi kas tunai, atau setor kas tunai ke Kas BRI. Tidak
            menambah/mengurangi total kas, hanya memindahkan saldo antar
            keduanya.
          </p>

          {kas_error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {kas_error}
            </div>
          )}
          {kas_success && (
            <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Transfer kas berhasil dicatat.
            </div>
          )}

          <form
            action={recordCashTransfer}
            className="bg-white border border-gray-200 rounded-lg p-6 grid sm:grid-cols-4 gap-3"
          >
            <select
              name="direction"
              defaultValue="bri_to_tunai"
              className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
            >
              <option value="bri_to_tunai">Tarik Tunai (Kas BRI → Petty Cash)</option>
              <option value="tunai_to_bri">Setor Tunai (Petty Cash → Kas BRI)</option>
            </select>
            <input
              type="number"
              name="amount"
              placeholder="Jumlah (Rp)"
              required
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              name="transfer_date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="note"
              placeholder="Catatan (opsional)"
              className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-3"
            />
            <SubmitButton
              pendingText="Menyimpan..."
              className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
            >
              Simpan
            </SubmitButton>
          </form>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-1">
          Saldo Awal Kas
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Saldo kas sebelum ada pembayaran/pengeluaran yang tercatat di
          aplikasi ini (mis. saldo dari pembukuan lama). Ikut dihitung ke
          &quot;Kas Saat Ini&quot; di halaman Laporan. Terkunci setelah
          diatur — ini hanya untuk saldo awal satu kali, bukan koreksi
          rutin.
        </p>
        <form
          action={updateOpeningBalance}
          className="bg-white border border-gray-200 rounded-lg p-6 grid sm:grid-cols-2 gap-3"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kas BRI
            </label>
            <input
              type="number"
              name="opening_balance_bri"
              step="1"
              defaultValue={settings?.opening_balance_bri ?? 0}
              disabled
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-gray-100 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Petty Cash
            </label>
            <input
              type="number"
              name="opening_balance_tunai"
              step="1"
              defaultValue={settings?.opening_balance_tunai ?? 0}
              disabled
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-gray-100 text-gray-500"
            />
          </div>
          <button
            type="submit"
            disabled
            className="sm:col-span-2 bg-gray-300 text-gray-500 rounded px-4 py-2 text-sm font-medium cursor-not-allowed"
          >
            Simpan
          </button>
        </form>
      </div>

      {WHATSAPP_PROVIDER_MANAGERS.includes(user.email) && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-1">
            Layanan WhatsApp
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Fonnte/Wablas kirim otomatis lewat gateway. Manual membuka link
            wa.me dari WhatsApp kamu sendiri untuk Kirim Info Login dan
            konfirmasi pembayaran (kamu yang klik Kirim). Off mematikan
            WhatsApp sama sekali di semua fungsi, termasuk notifikasi klaim
            baru ke 18G — kalau bukan Off, notifikasi itu selalu tetap lewat
            Wablas berapa pun pilihan lain di sini, karena itu terjadi tanpa
            ada yang standby untuk klik.
          </p>
          <div className="flex items-center rounded-full border border-gray-300 p-0.5 text-xs w-fit">
            {(
              [
                ["fonnte", "Fonnte"],
                ["wablas", "Wablas"],
                ["manual", "Manual"],
                ["off", "Off"],
              ] as const
            ).map(([value, label]) => (
              <form action={setWhatsAppProvider} key={value}>
                <input type="hidden" name="provider" value={value} />
                <button
                  type="submit"
                  className={`px-3 py-1 rounded-full transition ${
                    (settings?.whatsapp_provider ?? "fonnte") === value
                      ? "bg-blue-600 text-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {WHATSAPP_TEST_SENDERS.includes(user.email) && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-1">
            Kirim Pesan WhatsApp
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Uji coba integrasi WhatsApp — kirim pesan manual ke satu nomor,
            lewat gateway yang sedang aktif di atas. Butuh{" "}
            <code>FONNTE_TOKEN</code> atau <code>WABLAS_TOKEN</code> +{" "}
            <code>WABLAS_BASE_URL</code> di environment variables (lihat
            README).
          </p>

          {wa_error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {wa_error}
            </div>
          )}
          {wa_success && (
            <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Pesan berhasil dikirim.
            </div>
          )}

          <form
            action={sendTestWhatsApp}
            className="bg-white border border-gray-200 rounded-lg p-6 space-y-3"
          >
            <input
              name="phone"
              placeholder="No. HP (mis. 08123456789)"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              name="message"
              placeholder="Pesan"
              required
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <SubmitButton
              pendingText="Mengirim..."
              className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
            >
              Kirim
            </SubmitButton>
          </form>
        </div>
      )}

      {WEEKLY_REPORT_SENDERS.includes(user.email) && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-1">
            Laporan Mingguan
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Kirim ringkasan Kas Saat Ini + laporan bulan ini lewat WhatsApp
            — kirim otomatis tiap Minggu pagi lewat cron job, tombol ini
            untuk kirim manual kapan saja. Untuk sekarang hanya terkirim ke
            18G sebagai uji coba.
          </p>

          {wa_error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {wa_error}
            </div>
          )}
          {wa_success && (
            <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Laporan berhasil dikirim.
            </div>
          )}

          <form
            action={sendWeeklyReportNow}
            className="bg-white border border-gray-200 rounded-lg p-6"
          >
            <SubmitButton
              pendingText="Mengirim..."
              className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
            >
              Kirim Laporan Mingguan
            </SubmitButton>
          </form>
        </div>
      )}

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
          <div className="flex-1 min-w-40">
            <HouseholdSelect
              households={households ?? []}
              name="household_id"
              required
              placeholder="Pilih rumah..."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <SubmitButton
            pendingText="Membuat..."
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Buat User
          </SubmitButton>
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
