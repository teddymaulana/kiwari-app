"use client";

import { useState, type ReactNode } from "react";

export default function ReportTabs({
  checklistTable,
  monthlyTable,
}: {
  checklistTable: ReactNode;
  monthlyTable: ReactNode;
}) {
  const [tab, setTab] = useState<"checklist" | "monthly">("checklist");

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "checklist", label: "Checklist Pembayaran" },
    { key: "monthly", label: "Ringkasan Bulanan" },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-3 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm border-b-2 -mb-px transition ${
              tab === t.key
                ? "border-blue-600 text-blue-600 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "checklist" ? checklistTable : monthlyTable}
    </div>
  );
}
