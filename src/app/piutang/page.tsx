import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { addPersonnelLoan, deletePersonnelLoan } from "./actions";
import type { PersonnelLoan } from "@/lib/types";
import { formatRupiah, KAS_LABELS } from "@/lib/types";
import SubmitButton from "@/components/SubmitButton";

export default async function PiutangPage() {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const supabase = await createClient();
  const { data: loans } = await supabase
    .from("personnel_loans")
    .select("*")
    .order("transaction_date", { ascending: false })
    .returns<PersonnelLoan[]>();

  const rows = loans ?? [];

  const byPerson = new Map<string, { pinjam: number; bayar: number }>();
  rows.forEach((l) => {
    const entry = byPerson.get(l.person_name) ?? { pinjam: 0, bayar: 0 };
    if (l.transaction_type === "pinjam") entry.pinjam += Number(l.amount);
    else entry.bayar += Number(l.amount);
    byPerson.set(l.person_name, entry);
  });

  const personRows = Array.from(byPerson.entries())
    .map(([person_name, { pinjam, bayar }]) => ({
      person_name,
      pinjam,
      bayar,
      sisa: pinjam - bayar,
    }))
    .sort((a, b) => a.person_name.localeCompare(b.person_name));

  const totalOutstanding = personRows.reduce((s, p) => s + p.sisa, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">
        Piutang Personel
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Pinjaman (hutang) yang diberikan kas ke personel (mis. security,
        petugas kebersihan, taman), dan
        pembayarannya. Bukan bagian dari &quot;Kas Saat Ini&quot; di Laporan
        — ini uang yang sudah keluar dari kas dan belum kembali, bukan uang
        tunai/bank yang masih ada.
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-8 inline-block">
        <p className="text-xs text-gray-500 mb-1">Total Piutang Saat Ini</p>
        <p
          className={`text-2xl font-semibold ${
            totalOutstanding > 0 ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {formatRupiah(totalOutstanding)}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-4">
          Catat Pinjaman / Pembayaran
        </h2>
        <form action={addPersonnelLoan} className="grid sm:grid-cols-5 gap-3">
          <input
            name="person_name"
            placeholder="Nama (mis. Ayi)"
            required
            list="personnel-names"
            className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <datalist id="personnel-names">
            {personRows.map((p) => (
              <option key={p.person_name} value={p.person_name} />
            ))}
          </datalist>
          <select
            name="transaction_type"
            defaultValue="pinjam"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="pinjam">Pinjam (hutang baru)</option>
            <option value="bayar">Bayar (angsuran/lunas)</option>
          </select>
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
            name="transaction_date"
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
          <input
            name="note"
            placeholder="Catatan (opsional)"
            className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-3"
          />
          <SubmitButton
            pendingText="Menyimpan..."
            className="sm:col-span-5 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Simpan
          </SubmitButton>
        </form>
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">Per Orang</h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nama</th>
              <th className="px-4 py-2 font-medium">Total Pinjam</th>
              <th className="px-4 py-2 font-medium">Total Bayar</th>
              <th className="px-4 py-2 font-medium">Sisa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {personRows.map((p) => (
              <tr key={p.person_name}>
                <td className="px-4 py-2">{p.person_name}</td>
                <td className="px-4 py-2 text-gray-500">
                  {formatRupiah(p.pinjam)}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {formatRupiah(p.bayar)}
                </td>
                <td
                  className={`px-4 py-2 font-medium ${
                    p.sisa > 0 ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {formatRupiah(p.sisa)}
                </td>
              </tr>
            ))}
            {personRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Belum ada piutang tercatat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-medium text-gray-700 mb-2">
        Riwayat Transaksi
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Tanggal</th>
              <th className="px-4 py-2 font-medium">Nama</th>
              <th className="px-4 py-2 font-medium">Jenis</th>
              <th className="px-4 py-2 font-medium">Jumlah</th>
              <th className="px-4 py-2 font-medium">Kas</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(l.transaction_date).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-2">{l.person_name}</td>
                <td className="px-4 py-2">
                  {l.transaction_type === "pinjam" ? "Pinjam" : "Bayar"}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {formatRupiah(Number(l.amount))}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {KAS_LABELS[l.kas_type]}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={deletePersonnelLoan.bind(null, l.id)}>
                    <SubmitButton
                      pendingText="Menghapus..."
                      className="text-xs text-red-600 hover:text-red-700 transition"
                    >
                      Hapus
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-gray-400"
                >
                  Belum ada transaksi tercatat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
