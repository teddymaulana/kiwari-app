"use client";

import { useState, type ReactNode } from "react";

type Tab = "warga" | "kelola" | "lain";

export default function SumbanganTabs({
  warga,
  kelola,
  lainLain,
  defaultTab = "warga",
}: {
  warga: ReactNode;
  kelola: ReactNode;
  lainLain: ReactNode;
  defaultTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition ${
      active
        ? "border-blue-600 text-blue-600"
        : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div>
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        <button
          type="button"
          onClick={() => setTab("warga")}
          className={tabClass(tab === "warga")}
        >
          Sumbangan Warga
        </button>
        <button
          type="button"
          onClick={() => setTab("kelola")}
          className={tabClass(tab === "kelola")}
        >
          Kelola Sumbangan Warga
        </button>
        <button
          type="button"
          onClick={() => setTab("lain")}
          className={tabClass(tab === "lain")}
        >
          Lain-lain
        </button>
      </div>
      {tab === "warga" ? warga : tab === "kelola" ? kelola : lainLain}
    </div>
  );
}
