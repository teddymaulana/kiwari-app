"use client";

import { useState } from "react";
import { submitPaymentClaim } from "./actions";
import type { Household } from "@/lib/types";
import { MONTH_NAMES } from "@/lib/types";

type HouseholdOption = Pick<Household, "id" | "unit_no" | "name">;

export default function BayarIplForm({
  households,
  defaultAmount,
}: {
  households: HouseholdOption[];
  defaultAmount: number;
}) {
  const now = new Date();
  const [householdId, setHouseholdId] = useState("");
  const [amount, setAmount] = useState(NaN);
  const [suggestion, setSuggestion] = useState<HouseholdOption | null>(null);
  const [amountDetected, setAmountDetected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSuggestion(null);
    setAmountDetected(false);
    setCheckNote(null);
    if (!file) return;

    setChecking(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/extract-receipt", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (data.match) {
        setSuggestion(data.match);
        setHouseholdId(data.match.id);
      }
      if (data.amount) {
        setAmount(data.amount);
        setAmountDetected(true);
      }
      if (!data.match && !data.amount) {
        setCheckNote(
          "Rumah/jumlah tidak terdeteksi otomatis dari gambar, isi secara manual di bawah."
        );
      }
    } catch {
      setCheckNote("Gagal membaca gambar, isi secara manual di bawah.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <form action={submitPaymentClaim} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bukti Transfer (opsional)
        </label>
        <input
          type="file"
          name="receipt"
          accept="image/*"
          onChange={handleFileChange}
          className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-100 file:text-sm file:text-gray-700"
        />
        {checking && (
          <p className="text-xs text-gray-400 mt-1">Membaca gambar...</p>
        )}
        {suggestion && (
          <p className="text-xs text-green-600 mt-1">
            Sepertinya ini rumah {suggestion.unit_no} - {suggestion.name}.
            Sudah dipilih otomatis di bawah — ubah jika salah.
          </p>
        )}
        {amountDetected && (
          <p className="text-xs text-green-600 mt-1">
            Jumlah terdeteksi: Rp{amount.toLocaleString("id-ID")}. Sudah
            diisi otomatis di bawah — ubah jika salah.
          </p>
        )}
        {checkNote && (
          <p className="text-xs text-gray-500 mt-1">{checkNote}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Rumah
        </label>
        <select
          name="household_id"
          required
          value={householdId}
          onChange={(e) => setHouseholdId(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="" disabled>
            Pilih rumah...
          </option>
          {households.map((h) => (
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
          placeholder={`Contoh: ${defaultAmount}`}
          value={Number.isNaN(amount) ? "" : amount}
          onChange={(e) =>
            setAmount(e.target.value === "" ? NaN : Number(e.target.value))
          }
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Catatan (opsional)
        </label>
        <input
          name="note"
          placeholder="mis. transfer BCA a.n. ..."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition"
      >
        Kirim Klaim
      </button>
    </form>
  );
}
