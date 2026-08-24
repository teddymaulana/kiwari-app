"use client";

import { useState } from "react";

export default function DeletePaymentButton({
  action,
  description,
}: {
  action: () => Promise<void>;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-red-600 hover:text-red-700 transition"
      >
        Hapus
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900">
              Hapus pembayaran?
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              &ldquo;{description}&rdquo; akan dihapus permanen dan tidak
              bisa dikembalikan. Kas Saat Ini akan otomatis menyesuaikan.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  await action();
                  setPending(false);
                  setOpen(false);
                }}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
