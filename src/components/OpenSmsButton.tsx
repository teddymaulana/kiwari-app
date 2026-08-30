"use client";

import { useState } from "react";

// A real <a href="sms:..."> link, not a script-triggered navigation —
// mobile browsers reliably hand off a genuine anchor click to a custom
// URI scheme (same as tel: links), but often silently swallow a
// window.location.href assignment done from a button's onClick handler.
// Fires a server action alongside the click (without blocking the
// navigation) to record that it happened, same as OpenWaMeButton.
export default function OpenSmsButton({
  url,
  action,
  label,
  pendingLabel = "Membuka...",
  className,
}: {
  url: string;
  action: () => Promise<{ success: boolean }>;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <a
      href={url}
      className={className}
      onClick={() => {
        setPending(true);
        action().finally(() => setPending(false));
      }}
    >
      {pending ? pendingLabel : label}
    </a>
  );
}
