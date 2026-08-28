"use client";

import { useState } from "react";

// Opens one or more wa.me links in new tabs (the pengurus's own WhatsApp
// Web/Desktop, message pre-filled) and, once that's underway, calls a
// server action to record that it happened — used for the "manual"
// WhatsApp provider option (see src/lib/whatsapp.ts) where nothing is
// actually sent by our server at all, only pre-filled for the person to
// send themselves.
//
// Opens the windows before awaiting the action (not after) so they stay
// tied to the click's user-activation and don't get popup-blocked — an
// async gap first can cause browsers to block a window.open that follows.
export default function OpenWaMeButton({
  urls,
  action,
  label,
  pendingLabel = "Membuka...",
  className,
}: {
  urls: string[];
  action: () => Promise<{ success: boolean }>;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={async () => {
        setPending(true);
        try {
          urls.forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
          await action();
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
