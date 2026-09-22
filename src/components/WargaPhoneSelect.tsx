"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type WargaPhoneHousehold = {
  id: string;
  unit_no: string;
  name: string;
  phone: string | null;
  phone_pasangan: string | null;
  alt_names: string | null;
};

type PhoneOption = { key: string; label: string; phone: string };

// Searchable phone-number field for "Kirim Pesan WhatsApp" — lets pengurus
// find a warga's number by unit/name instead of hunting it down manually.
// Picking a result keeps showing "unit - Nama - No. HP" (not just the bare
// number) so it's clear who's selected, while a hidden field carries the
// actual phone number that gets submitted — same split as HouseholdSelect,
// except here the visible text can also just be typed in directly as a raw
// number when the target isn't a warga in the list, since there's no id to
// fall back on.
export default function WargaPhoneSelect({
  households,
  name,
  placeholder = "No. HP, atau cari nama/no. rumah warga...",
  className = "w-full rounded border border-gray-300 px-3 py-2 text-sm",
  disabled,
}: {
  households: WargaPhoneHousehold[];
  name: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const options = useMemo<PhoneOption[]>(() => {
    const list: PhoneOption[] = [];
    for (const h of households) {
      if (h.phone) {
        list.push({
          key: `${h.id}-1`,
          label: `${h.unit_no} - ${h.name}`,
          phone: h.phone,
        });
      }
      if (h.phone_pasangan) {
        // alt_names is freeform (comma-separated, meant for OCR receipt
        // matching) — best-effort read its first entry as the spouse's
        // name, falling back to the generic "(pasangan)" tag when empty.
        const pasanganName = h.alt_names?.split(",")[0]?.trim();
        list.push({
          key: `${h.id}-2`,
          label: pasanganName
            ? `${h.unit_no} - ${pasanganName}`
            : `${h.unit_no} - ${h.name} (pasangan)`,
          phone: h.phone_pasangan,
        });
      }
    }
    return list;
  }, [households]);

  const [value, setValue] = useState(""); // the actual phone number submitted
  const [query, setQuery] = useState(""); // what's shown in the input
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.phone.includes(q)
      )
    : options;

  function pick(o: PhoneOption) {
    setValue(o.phone);
    setQuery(`${o.label} - ${o.phone}`);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        className={`${className} disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed`}
        onFocus={(e) => {
          if (disabled) return;
          setOpen(true);
          setHighlight(0);
          e.target.select();
        }}
        onChange={(e) => {
          // Typing (rather than picking) means the text itself is the
          // number to send to — keep the hidden field in sync with it
          // directly, same as before this component split display from
          // submitted value.
          setQuery(e.target.value);
          setValue(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) return;
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
      {open && !disabled && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg text-sm">
          {filtered.map((o, i) => (
            <li
              key={o.key}
              className={`px-3 py-1.5 cursor-pointer flex justify-between gap-2 ${
                i === highlight
                  ? "bg-blue-50 text-blue-700"
                  : "hover:bg-gray-50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span>{o.label}</span>
              <span className="text-gray-400">{o.phone}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
