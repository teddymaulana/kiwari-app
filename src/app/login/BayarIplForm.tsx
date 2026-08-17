"use client";

import { useEffect, useState } from "react";
import { submitPaymentClaim } from "./actions";
import type { Household } from "@/lib/types";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";

type HouseholdOption = Pick<Household, "id" | "unit_no" | "name">;

export default function BayarIplForm({
  households,
  defaultAmount,
  year,
}: {
  households: HouseholdOption[];
  defaultAmount: number;
  year: number;
}) {
  const now = new Date();
  const [householdId, setHouseholdId] = useState("");
  const [suggestion, setSuggestion] = useState<HouseholdOption | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [unpaidMonths, setUnpaidMonths] = useState<number[] | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);

  useEffect(() => {
    if (!householdId) return;

    let cancelled = false;
    fetch(`/api/unpaid-months?household_id=${householdId}&year=${year}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const months: number[] = data.unpaidMonths ?? [];
        setUnpaidMonths(months);
        const currentMonth = now.getMonth() + 1;
        setSelectedMonths(months.includes(currentMonth) ? [currentMonth] : []);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, year]);

  function selectHousehold(id: string) {
    setHouseholdId(id);
    setUnpaidMonths(null);
    setSelectedMonths([]);
  }

  function toggleMonth(month: number) {
    setSelectedMonths((prev) =>
      prev.includes(month)
        ? prev.filter((m) => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
  }

  const total = defaultAmount * selectedMonths.length;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSuggestion(null);
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
        selectHousehold(data.match.id);
      } else {
        setCheckNote(
          "Rumah tidak terdeteksi otomatis dari gambar, pilih secara manual di bawah."
        );
      }
    } catch {
      setCheckNote("Gagal membaca gambar, pilih rumah secara manual di bawah.");
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
          onChange={(e) => selectHousehold(e.target.value)}
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

      <input type="hidden" name="period_year" value={year} />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bulan ({year})
        </label>
        {!householdId ? (
          <p className="text-sm text-gray-500">Pilih rumah terlebih dahulu.</p>
        ) : unpaidMonths === null ? (
          <p className="text-sm text-gray-500">Memuat bulan...</p>
        ) : unpaidMonths.length === 0 ? (
          <p className="text-sm text-gray-500">
            Semua bulan tahun {year} sudah lunas atau menunggu verifikasi.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {unpaidMonths.map((m) => (
              <label
                key={m}
                className={`flex items-center gap-1.5 text-sm rounded border px-2 py-1.5 cursor-pointer ${
                  selectedMonths.includes(m)
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  name="period_months"
                  value={m}
                  checked={selectedMonths.includes(m)}
                  onChange={() => toggleMonth(m)}
                  className="accent-blue-600"
                />
                {MONTH_NAMES[m - 1]}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Jumlah
        </label>
        <p className="text-sm text-gray-700 rounded border border-gray-200 bg-gray-50 px-3 py-2">
          {formatRupiah(defaultAmount)} / bulan
          {selectedMonths.length > 1 &&
            ` × ${selectedMonths.length} bulan = ${formatRupiah(total)}`}
        </p>
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
        disabled={!householdId || selectedMonths.length === 0}
        className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Kirim Klaim
      </button>
    </form>
  );
}
