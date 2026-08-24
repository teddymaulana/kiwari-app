"use client";

import { useEffect, useState } from "react";
import { recordPayments } from "./actions";
import type { Household } from "@/lib/types";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";
import HouseholdSelect from "@/components/HouseholdSelect";
import SubmitButton from "@/components/SubmitButton";

type HouseholdOption = Pick<Household, "id" | "unit_no" | "name">;

// Only 2026 data exists so far, so the year is locked instead of a free
// input — swap this back to an editable field once other years exist.
const YEAR = 2026;

export default function RecordPaymentForm({
  households,
  defaultAmount,
}: {
  households: HouseholdOption[];
  defaultAmount: number;
}) {
  const now = new Date();
  const [householdId, setHouseholdId] = useState("");
  const [unpaidMonths, setUnpaidMonths] = useState<number[] | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);

  useEffect(() => {
    if (!householdId) return;

    let cancelled = false;
    fetch(`/api/unpaid-months?household_id=${householdId}&year=${YEAR}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const months: number[] = data.unpaidMonths ?? [];
        setUnpaidMonths(months);
        const currentMonth = now.getMonth() + 1;
        setSelectedMonths(
          YEAR === now.getFullYear() && months.includes(currentMonth)
            ? [currentMonth]
            : []
        );
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

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

  return (
    <form
      action={recordPayments}
      className="bg-white border border-gray-200 rounded-lg p-6 space-y-4"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Warga
        </label>
        <HouseholdSelect
          households={households}
          name="household_id"
          required
          value={householdId}
          onChange={selectHousehold}
          placeholder="Cari No. Rumah atau nama..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tahun
        </label>
        <input type="hidden" name="period_year" value={YEAR} />
        <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          {YEAR}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bulan
        </label>
        {!householdId ? (
          <p className="text-sm text-gray-500">Pilih warga terlebih dahulu.</p>
        ) : unpaidMonths === null ? (
          <p className="text-sm text-gray-500">Memuat bulan...</p>
        ) : unpaidMonths.length === 0 ? (
          <p className="text-sm text-gray-500">
            Semua bulan tahun {YEAR} sudah lunas atau menunggu verifikasi.
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
        <input type="hidden" name="amount" value={defaultAmount} />
        <p className="text-sm text-gray-700 rounded border border-gray-200 bg-gray-50 px-3 py-2">
          {formatRupiah(defaultAmount)} / bulan
          {selectedMonths.length > 1 &&
            ` × ${selectedMonths.length} bulan = ${formatRupiah(total)}`}
        </p>
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
          Kas Tujuan
        </label>
        <select
          name="kas_type"
          defaultValue="bri"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="bri">Kas BRI</option>
          <option value="tunai">Petty Cash</option>
        </select>
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

      <SubmitButton
        disabled={!householdId || selectedMonths.length === 0}
        pendingText="Menyimpan..."
        className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition"
      >
        Simpan
      </SubmitButton>
    </form>
  );
}
