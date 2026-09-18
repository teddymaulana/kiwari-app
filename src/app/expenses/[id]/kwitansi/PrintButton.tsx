"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
    >
      Cetak
    </button>
  );
}
