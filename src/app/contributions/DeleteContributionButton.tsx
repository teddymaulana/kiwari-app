"use client";

import { useState } from "react";

export default function DeleteContributionButton({
  action,
  description,
}: {
  action: () => Promise<void>;
  description: string;
}) {
  const [open, setOpen] = useState(false);

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
              Hapus sumbangan?
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              &ldquo;{description}&rdquo; akan dihapus permanen dan tidak
              bisa dikembalikan.
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
                  await action();
                  setOpen(false);
                }}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 transition"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
