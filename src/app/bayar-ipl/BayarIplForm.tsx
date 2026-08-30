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
  const currentMonth = now.getMonth() + 1;
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() =>
    unpaidMonths.includes(currentMonth) ? [currentMonth] : []
  );

  // From the current month onward, months must be picked in order, oldest
  // first — a warga can't pick October without September also selected.
  // Past/arrears months (before the current month) are exempt — those can
  // be left unpaid and picked independently, in any combination, since
  // forcing a full backlog catch-up here would be bad UX.
  function canToggle(month: number): boolean {
    if (selectedMonths.includes(month)) return true;
    if (month < currentMonth) return true;
    const idx = unpaidMonths.indexOf(month);
    return unpaidMonths
      .slice(0, idx)
      .filter((m) => m >= currentMonth)
      .every((m) => selectedMonths.includes(m));
  }

  function toggleMonth(month: number) {
    if (!canToggle(month)) return;
    setSelectedMonths((prev) => {
      if (!prev.includes(month)) {
        return [...prev, month].sort((a, b) => a - b);
      }
      if (month < currentMonth) {
        return prev.filter((m) => m !== month);
      }
      // Cascade-unselect later current/future months too, since they'd no
      // longer form a contiguous run — past months are always < month
      // here, so they're untouched by this filter.
      return prev.filter((m) => m < month);
    });
  }

  const total = defaultAmount * selectedMonths.length;

  return (
    <form action={submitOwnPaymentClaim} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Bukti Transfer
        </label>
        <input
          type="file"
          name="receipt"
          accept="image/*"
          required
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
            {unpaidMonths.map((m) => {
              const selectable = canToggle(m);
              return (
                <label
                  key={m}
                  className={`flex items-center gap-1.5 text-sm rounded border px-2 py-1.5 ${
                    selectedMonths.includes(m)
                      ? "border-blue-500 bg-blue-50 text-blue-700 cursor-pointer"
                      : selectable
                        ? "border-gray-300 text-gray-700 cursor-pointer"
                        : "border-gray-200 text-gray-300 cursor-not-allowed"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="period_months"
                    value={m}
                    checked={selectedMonths.includes(m)}
                    disabled={!selectable}
                    onChange={() => toggleMonth(m)}
                    className="accent-blue-600"
                  />
                  {MONTH_NAMES[m - 1]}
                </label>
              );
            })}
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
