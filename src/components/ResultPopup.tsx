"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

// Modal shown after a server action redirects back with a result in the
// query string. Closing it strips the query params (whichever page it's
// on — Pengaturan, Humas, ...) so a refresh doesn't bring it back, without
// navigating away from that page.
export default function ResultPopup({
  kind,
  message,
}: {
  kind: "success" | "error";
  message: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  if (!open) return null;

  const ok = kind === "success";
  function close() {
    setOpen(false);
    router.replace(pathname, { scroll: false });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={close}
    >
      <div
        role="alertdialog"
        className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full text-xl ${
            ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {ok ? "✓" : "!"}
        </div>
        <p className="text-sm text-gray-800 mb-4">{message}</p>
        <button
          type="button"
          onClick={close}
          autoFocus
          className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
        >
          OK
        </button>
      </div>
    </div>
  );
}
