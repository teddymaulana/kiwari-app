"use client";

import { useState } from "react";

export default function ReleaseAllDraftsButton({
  action,
  ids,
}: {
  action: (formData: FormData) => Promise<void>;
  ids: string[];
}) {
  const [open, setOpen] = useState(false);
  const count = ids.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={count === 0}
        className="text-sm rounded bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
      >
        Rilis Semua Draft ({count})
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
              Rilis semua draft?
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {count} pengeluaran draft akan dirilis dan langsung terlihat
              oleh warga.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const formData = new FormData();
                  ids.forEach((id) => formData.append("ids", id));
                  await action(formData);
                  setOpen(false);
                }}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 transition"
              >
                Rilis Semua
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
