"use client";

import { useState } from "react";

export default function ToggleActiveButton({
  action,
  householdLabel,
  isActive,
}: {
  action: () => Promise<void>;
  householdLabel: string;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const label = isActive ? "Nonaktifkan" : "Aktifkan";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-500 hover:text-blue-600 transition"
      >
        {label}
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
              {label} warga?
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {isActive
                ? `${householdLabel} akan ditandai nonaktif.`
                : `${householdLabel} akan diaktifkan kembali.`}
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
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? "Memproses..." : label}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
