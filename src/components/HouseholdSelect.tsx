"use client";

import { useEffect, useRef, useState } from "react";

export type HouseholdOption = { id: string; unit_no: string; name: string };

function labelFor(households: HouseholdOption[], id: string): string {
  const h = households.find((x) => x.id === id);
  return h ? `${h.unit_no} - ${h.name}` : "";
}

// Searchable replacement for a plain <select> of households — the native
// dropdown gets unusable once there are 50+ units. Works both "controlled"
// (pass value/onChange — used where a parent needs to react to the pick,
// e.g. auto-loading unpaid months) and "uncontrolled" (omit them — the
// component tracks its own selection and just submits `name` as a hidden
// field, for plain server-action forms with no other client state).
export default function HouseholdSelect({
  households,
  name,
  value: controlledValue,
  onChange,
  placeholder = "Cari No. Rumah atau nama...",
  required,
  className = "w-full rounded border border-gray-300 px-3 py-2 text-sm",
}: {
  households: HouseholdOption[];
  name: string;
  value?: string;
  onChange?: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState("");
  const value = controlledValue ?? internalValue;
  const setValue = onChange ?? setInternalValue;

  const [query, setQuery] = useState(() => labelFor(households, value));
  // Keep the displayed text in sync when `value` changes from outside (e.g.
  // OCR auto-match setting householdId in a parent form) — adjusted during
  // render rather than in an effect, per React's guidance for state that
  // depends on a prop.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setQuery(labelFor(households, value));
  }

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const selectedLabel = value ? labelFor(households, value).toLowerCase() : null;
  const filtered =
    q && q !== selectedLabel
      ? households.filter(
          (h) =>
            h.unit_no.toLowerCase().includes(q) || h.name.toLowerCase().includes(q)
        )
      : households;

  function pick(h: HouseholdOption) {
    setValue(h.id);
    setSyncedValue(h.id);
    setQuery(`${h.unit_no} - ${h.name}`);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} required={required} />
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        className={className}
        onFocus={(e) => {
          setOpen(true);
          setHighlight(0);
          e.target.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (value) {
            setValue("");
            setSyncedValue("");
          }
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (filtered[highlight]) {
              e.preventDefault();
              pick(filtered[highlight]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">Tidak ditemukan</li>
          ) : (
            filtered.map((h, i) => (
              <li
                key={h.id}
                className={`px-3 py-1.5 cursor-pointer ${
                  i === highlight ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(h);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                {h.unit_no} - {h.name}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
