"use client";

import { useState } from "react";

export default function EditHouseholdButton({
  action,
  name,
  phone,
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
  phone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-500 hover:text-blue-600 transition"
      >
        Ubah
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
              Ubah data warga
            </h3>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nama Kepala Keluarga
              </label>
              <input
                name="name"
                defaultValue={name}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                No. HP
              </label>
              <input
                name="phone"
                defaultValue={phone ?? ""}
                placeholder="opsional"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
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
