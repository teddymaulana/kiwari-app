"use client";

import { useState } from "react";

// Shared by payments and contributions rows on /payments and /contributions
// — toggles their "excluded" flag (pulled out of Lunas/total calculations
// without deleting the row) between Kecualikan and Sertakan.
export default function ExcludeToggleButton({
  action,
  excluded,
}: {
  action: () => Promise<void>;
  excluded: boolean;
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await action();
        setPending(false);
      }}
      className={`text-xs transition disabled:opacity-60 disabled:cursor-not-allowed ${
        excluded
          ? "text-blue-600 hover:text-blue-700"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {pending ? "Memproses..." : excluded ? "Sertakan" : "Kecualikan"}
    </button>
  );
}
