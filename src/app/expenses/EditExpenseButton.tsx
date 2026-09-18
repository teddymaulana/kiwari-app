"use client";

import { useState } from "react";
import { PencilIcon } from "@/components/icons";
import type { KasType } from "@/lib/types";

export default function EditExpenseButton({
  action,
  description,
  amount,
  expenseDate,
  kasType,
  hasReceipt,
}: {
  action: (formData: FormData) => Promise<void>;
  description: string;
  amount: number;
  expenseDate: string;
  kasType: KasType;
  hasReceipt: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ubah"
        className="inline-flex text-gray-500 hover:text-blue-600 transition"
      >
        <PencilIcon className="h-4 w-4" />
        <span className="sr-only">Ubah</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setOpen(false)}
        >
          <form
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg space-y-3"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              await action(new FormData(e.currentTarget));
              setPending(false);
              setOpen(false);
            }}
          >
            <h3 className="text-sm font-semibold text-gray-900">
              Ubah pengeluaran
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Keterangan
              </label>
              <input
                name="description"
                defaultValue={description}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Jumlah
              </label>
              <input
                type="number"
                name="amount"
                defaultValue={amount}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tanggal
              </label>
              <input
                type="date"
                name="expense_date"
                defaultValue={expenseDate}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Sumber Kas
              </label>
              <select
                name="kas_type"
                defaultValue={kasType}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="bri">Kas BRI</option>
                <option value="tunai">Petty Cash</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Bukti Pengeluaran {hasReceipt && "(ganti, opsional)"}
              </label>
              <input
                type="file"
                name="receipt"
                accept="image/*"
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-100 file:text-sm file:text-gray-700"
              />
              {hasReceipt && (
                <p className="mt-1 text-xs text-gray-400">
                  Sudah ada bukti tersimpan — kosongkan untuk tetap pakai yang lama.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
