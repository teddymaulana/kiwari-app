"use client";

import { useState } from "react";
import { submitOwnPaymentClaim } from "./actions";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";
import SubmitButton from "@/components/SubmitButton";

export default function BayarIplForm({
  defaultAmount,
  year,
  unpaidMonths,
}: {
  defaultAmount: number;
  year: number;
  unpaidMonths: number[];
}) {
  const now = new Date();
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() =>
    unpaidMonths.includes(now.getMonth() + 1) ? [now.getMonth() + 1] : []
  );

  function toggleMonth(month: number) {
    setSelectedMonths((prev) =>
      prev.includes(month)
        ? prev.filter((m) => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
  }

  const total = defaultAmount * selectedMonths.length;

  return (
    <form action={submitOwnPaymentClaim} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bukti Transfer (opsional)
        </label>
        <input
          type="file"
          name="receipt"
          accept="image/*"
          className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-100 file:text-sm file:text-gray-700"
        />
      </div>

      <input type="hidden" name="period_year" value={year} />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bulan ({year})
        </label>
        {unpaidMonths.length === 0 ? (
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

      <SubmitButton
        disabled={selectedMonths.length === 0}
        pendingText="Mengirim..."
        className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition"
      >
        Kirim Klaim
      </SubmitButton>
    </form>
  );
}
