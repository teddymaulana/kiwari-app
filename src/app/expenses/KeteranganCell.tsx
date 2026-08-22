"use client";

import { useState } from "react";

export default function KeteranganCell({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <td
      onClick={() => setExpanded((v) => !v)}
      title={expanded ? undefined : text}
      className={
        expanded
          ? "px-4 py-2 cursor-pointer"
          : "px-4 py-2 max-w-50 truncate cursor-pointer"
      }
    >
      {text}
    </td>
  );
}
