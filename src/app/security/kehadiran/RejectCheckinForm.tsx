"use client";

import { useState } from "react";

// Tolak asks first — a rejected check-in still holds that guard's slot
// for the shift (unique per guard/shift), so they can't re-send absen.
// Same dialog as payments/DeletePaymentButton.
export default function RejectCheckinForm({
  action,
  guardName,
  shiftLabel,
}: {
  action: () => Promise<void>;
  guardName: string;
  shiftLabel: string;
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
        Tolak
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900">
              Tolak absen {guardName}?
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Absen {shiftLabel} akan ditandai ditolak. {guardName} tidak bisa
              mengulang absen ini untuk shift tersebut.
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
                {pending ? "Menolak..." : "Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
