import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import {
  updateMonthlyAmount,
  updateOpeningBalance,
  createWargaUser,
  confirmPaymentClaim,
  rejectPaymentClaim,
  sendTestWhatsApp,
  recordCashTransfer,
} from "./actions";
import type { Household, Payment, Settings } from "@/lib/types";
import { MONTH_NAMES, formatRupiah, compareUnitNo } from "@/lib/types";

type PendingClaim = Payment & {
  households: Pick<Household, "unit_no" | "name"> | null;
};

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

  const { data: pendingClaims } = await supabase
    .from("payments")
    .select("*, households(unit_no, name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<PendingClaim[]>();

  const admin = createAdminClient();
  const receiptUrls = new Map<string, string>();
  await Promise.all(
    (pendingClaims ?? [])
      .filter((c) => c.receipt_path)
      .map(async (c) => {
        const { data } = await admin.storage
          .from("bukti-transfer")
          .createSignedUrl(c.receipt_path!, 60 * 10);
        if (data?.signedUrl) receiptUrls.set(c.id, data.signedUrl);
      })
  );

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
          <button
            type="submit"
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Simpan
          </button>
        </form>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-medium text-gray-700">
            Verifikasi Pembayaran
          </h2>
          {(pendingClaims ?? []).length > 0 && (
            <span className="inline-block rounded-full bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5">
              {(pendingClaims ?? []).length} menunggu
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Klaim yang dikirim warga lewat form &quot;Bayar IPL&quot; di
          halaman login, tanpa perlu akun. Belum terhitung Lunas sampai
          dikonfirmasi.
        </p>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {(pendingClaims ?? []).map((c) => (
            <div
              key={c.id}
              className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="text-sm">
                <p className="font-medium text-gray-900">
                  {c.households?.unit_no} - {c.households?.name}
                </p>
                <p className="text-xs text-gray-500">
                  {MONTH_NAMES[c.period_month - 1]} {c.period_year} —{" "}
                  {formatRupiah(Number(c.amount))}
                  {c.note && ` — ${c.note}`}
                </p>
              </div>
              <div className="flex gap-2">
                {receiptUrls.has(c.id) && (
                  <a
                    href={receiptUrls.get(c.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 transition"
                  >
                    Lihat Bukti
                  </a>
                )}
                <form action={confirmPaymentClaim.bind(null, c.id)}>
                  <button
                    type="submit"
                    className="text-xs bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700 transition"
                  >
                    Konfirmasi
                  </button>
                </form>
                <form action={rejectPaymentClaim.bind(null, c.id)}>
                  <button
                    type="submit"
                    className="text-xs text-red-600 border border-red-200 rounded px-3 py-1.5 hover:bg-red-50 transition"
                  >
                    Tolak
                  </button>
                </form>
              </div>
            </div>
          ))}
          {(pendingClaims ?? []).length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-xs">
              Tidak ada klaim menunggu verifikasi.
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-1">
          Kirim Pesan WhatsApp
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Uji coba integrasi WhatsApp (Fonnte) — kirim pesan manual ke satu
          nomor. Butuh <code>FONNTE_TOKEN</code> di environment variables
          (lihat README).
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
          <button
            type="submit"
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Kirim
          </button>
        </form>
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
