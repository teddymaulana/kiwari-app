"use client";

import { useEffect, useRef, useState } from "react";
import { submitPaymentClaim } from "./actions";
import type { Household } from "@/lib/types";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";
import HouseholdSelect from "@/components/HouseholdSelect";
import SubmitButton from "@/components/SubmitButton";

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
  const currentMonth = now.getMonth() + 1;
  const [householdId, setHouseholdId] = useState("");
  const [suggestion, setSuggestion] = useState<HouseholdOption | null>(null);
  const [detectedAmount, setDetectedAmount] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const [unpaidMonths, setUnpaidMonths] = useState<number[] | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!householdId) return;

    let cancelled = false;
    fetch(`/api/unpaid-months?household_id=${householdId}&year=${year}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const months: number[] = data.unpaidMonths ?? [];
        setUnpaidMonths(months);
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

  // From the current month onward, months must be picked in order, oldest
  // first — a warga can't pick October without September also selected.
  // Past/arrears months (before the current month) are exempt — those can
  // be left unpaid and picked independently, in any combination, since
  // forcing a full backlog catch-up here would be bad UX.
  function canToggle(month: number): boolean {
    if (selectedMonths.includes(month)) return true;
    if (month < currentMonth) return true;
    if (!unpaidMonths) return false;
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
  // How much of the detected transfer is left after accounting for the
  // months picked so far — goes negative (shown in red) if more months
  // are selected than the detected amount actually covers.
  const remaining = detectedAmount !== null ? detectedAmount - total : null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSuggestion(null);
    setDetectedAmount(null);
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

      if (typeof data.amount === "number") {
        setDetectedAmount(data.amount);
      }

      if (data.match) {
        setSuggestion(data.match);
        selectHousehold(data.match.id);
      } else {
        // Clear any previously-selected household too — a new receipt that
        // fails to match shouldn't leave a stale pick from an earlier one.
        selectHousehold("");
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

  // Flags a claim for pengurus when the detected transfer amount looks
  // short of the total being claimed — folded into the existing note
  // field (already shown in Verifikasi Pembayaran) rather than a new
  // column, so it needs no schema/backend change. This is informational
  // only: the actual recorded amount always comes from settings server-
  // side (see paymentClaim.ts), never from this client-detected figure.
  function handleSubmit() {
    if (remaining === null || remaining >= 0 || !noteRef.current) return;
    const warning = `[Nominal transfer terdeteksi ${formatRupiah(detectedAmount!)}, kurang ${formatRupiah(Math.abs(remaining))} dari total klaim]`;
    noteRef.current.value = noteRef.current.value
      ? `${warning} ${noteRef.current.value}`
      : warning;
  }

  return (
    <form
      action={submitPaymentClaim}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
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
        <HouseholdSelect
          households={households}
          name="household_id"
          required
          value={householdId}
          onChange={selectHousehold}
          placeholder="Cari No. Rumah atau nama..."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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

      {detectedAmount !== null && (
        <p
          className={`text-xs ${
            remaining !== null && remaining < 0
              ? "text-red-600"
              : "text-green-600"
          }`}
        >
          Nominal terdeteksi di bukti transfer:{" "}
          <strong>{formatRupiah(detectedAmount)}</strong>
          {selectedMonths.length > 0 && remaining !== null && (
            <>
              <br />
              Sisa: <strong>{formatRupiah(remaining)}</strong>
            </>
          )}
        </p>
      )}

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
          ref={noteRef}
          name="note"
          placeholder="mis. transfer BCA a.n. ..."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <SubmitButton
        disabled={!householdId || selectedMonths.length === 0}
        pendingText="Mengirim..."
        className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition"
      >
        Kirim Klaim
      </SubmitButton>
    </form>
  );
}
