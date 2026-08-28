"use client";

import { useMemo, useState } from "react";
import type { DenahHousehold } from "./page";

// Exact grid geometry (col, row, colspan, rowspan) extracted from the
// original "Denah Kiwari Residence" spreadsheet — every unit box below is
// the real merged-cell region from that sheet, not an eyeballed guess, so
// this reproduces the source layout faithfully. Row 1 is reserved for zone
// labels; unit geometry below is shifted down by ROW_OFFSET to make room.
//
// Deliberately not connected to any household/IPL data — this is a plain
// reference map, not a status dashboard.
const ROW_OFFSET = 1;

type UnitCell = {
  unit_no: string;
  col: number;
  row: number;
  colspan: number;
  rowspan: number;
};

const UNIT_GEOMETRY: UnitCell[] = [
  { unit_no: "19K", col: 4, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19J", col: 5, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19I", col: 6, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19H", col: 7, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19G", col: 8, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19F", col: 9, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19E", col: 10, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19D", col: 11, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19C", col: 12, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19B", col: 13, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19A", col: 14, row: 1, colspan: 1, rowspan: 4 },
  { unit_no: "19L", col: 6, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19M", col: 7, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19N", col: 8, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19O", col: 9, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19P", col: 10, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19Q", col: 11, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19R", col: 12, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19S", col: 13, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19T", col: 14, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19U", col: 15, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "19V", col: 16, row: 10, colspan: 1, rowspan: 4 },
  { unit_no: "9X", col: 1, row: 12, colspan: 2, rowspan: 2 },
  { unit_no: "9W", col: 1, row: 14, colspan: 2, rowspan: 2 },
  { unit_no: "18Q", col: 6, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18R", col: 7, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18S", col: 8, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18T", col: 9, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18U", col: 10, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18V", col: 11, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18W", col: 12, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18X", col: 13, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18Y", col: 14, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18Z", col: 15, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "18AA", col: 16, row: 14, colspan: 1, rowspan: 4 },
  { unit_no: "9V", col: 1, row: 16, colspan: 2, rowspan: 2 },
  { unit_no: "9U", col: 1, row: 18, colspan: 2, rowspan: 2 },
  { unit_no: "9T", col: 1, row: 20, colspan: 2, rowspan: 2 },
  { unit_no: "18I", col: 6, row: 20, colspan: 1, rowspan: 4 },
  { unit_no: "18J", col: 7, row: 20, colspan: 1, rowspan: 4 },
  { unit_no: "18K", col: 8, row: 20, colspan: 1, rowspan: 4 },
  { unit_no: "18L", col: 9, row: 20, colspan: 1, rowspan: 4 },
  { unit_no: "18M", col: 10, row: 20, colspan: 1, rowspan: 4 },
  { unit_no: "18N", col: 11, row: 20, colspan: 1, rowspan: 4 },
  { unit_no: "18O", col: 12, row: 20, colspan: 1, rowspan: 4 },
  { unit_no: "18P", col: 13, row: 20, colspan: 1, rowspan: 4 },
  { unit_no: "9S", col: 1, row: 22, colspan: 2, rowspan: 2 },
  { unit_no: "9R", col: 1, row: 24, colspan: 2, rowspan: 2 },
  { unit_no: "18H", col: 6, row: 24, colspan: 1, rowspan: 4 },
  { unit_no: "18G", col: 7, row: 24, colspan: 1, rowspan: 4 },
  { unit_no: "18F", col: 8, row: 24, colspan: 1, rowspan: 4 },
  { unit_no: "18E", col: 9, row: 24, colspan: 1, rowspan: 4 },
  { unit_no: "18D", col: 10, row: 24, colspan: 1, rowspan: 4 },
  { unit_no: "18C", col: 11, row: 24, colspan: 1, rowspan: 4 },
  { unit_no: "18B", col: 12, row: 24, colspan: 1, rowspan: 4 },
  { unit_no: "18A", col: 13, row: 24, colspan: 1, rowspan: 4 },
  { unit_no: "9Q", col: 1, row: 26, colspan: 2, rowspan: 2 },
  { unit_no: "9P", col: 1, row: 28, colspan: 2, rowspan: 2 },
  { unit_no: "9O", col: 1, row: 30, colspan: 2, rowspan: 2 },
  { unit_no: "9M", col: 5, row: 30, colspan: 2, rowspan: 4 },
  { unit_no: "9L", col: 7, row: 30, colspan: 1, rowspan: 4 },
  { unit_no: "9K", col: 8, row: 30, colspan: 1, rowspan: 4 },
  { unit_no: "9J", col: 9, row: 30, colspan: 1, rowspan: 4 },
  { unit_no: "9I", col: 10, row: 30, colspan: 1, rowspan: 4 },
  { unit_no: "9H", col: 11, row: 30, colspan: 2, rowspan: 4 },
  { unit_no: "9N", col: 1, row: 32, colspan: 2, rowspan: 2 },
  { unit_no: "9G", col: 11, row: 34, colspan: 2, rowspan: 2 },
  { unit_no: "9F", col: 11, row: 36, colspan: 2, rowspan: 2 },
  { unit_no: "8K", col: 15, row: 36, colspan: 2, rowspan: 2 },
  { unit_no: "8L", col: 17, row: 36, colspan: 2, rowspan: 4 },
  { unit_no: "8M", col: 19, row: 36, colspan: 1, rowspan: 4 },
  { unit_no: "8N", col: 20, row: 36, colspan: 1, rowspan: 4 },
  { unit_no: "8O", col: 21, row: 36, colspan: 1, rowspan: 4 },
  { unit_no: "8P", col: 22, row: 36, colspan: 1, rowspan: 4 },
  { unit_no: "8Q", col: 23, row: 36, colspan: 1, rowspan: 4 },
  { unit_no: "8R", col: 24, row: 36, colspan: 1, rowspan: 4 },
  { unit_no: "9E", col: 11, row: 38, colspan: 2, rowspan: 2 },
  { unit_no: "8J", col: 15, row: 38, colspan: 2, rowspan: 2 },
  { unit_no: "9D", col: 11, row: 40, colspan: 2, rowspan: 2 },
  { unit_no: "8I", col: 15, row: 40, colspan: 2, rowspan: 2 },
  { unit_no: "9C", col: 11, row: 42, colspan: 2, rowspan: 2 },
  { unit_no: "8H", col: 15, row: 42, colspan: 2, rowspan: 2 },
  { unit_no: "9B", col: 11, row: 44, colspan: 2, rowspan: 2 },
  { unit_no: "8G", col: 15, row: 44, colspan: 2, rowspan: 2 },
  { unit_no: "9A", col: 11, row: 46, colspan: 2, rowspan: 2 },
  { unit_no: "8F", col: 15, row: 46, colspan: 2, rowspan: 2 },
  { unit_no: "8A", col: 12, row: 51, colspan: 1, rowspan: 4 },
  { unit_no: "8B", col: 13, row: 51, colspan: 1, rowspan: 4 },
  { unit_no: "8C", col: 14, row: 51, colspan: 1, rowspan: 4 },
  { unit_no: "8D", col: 15, row: 51, colspan: 1, rowspan: 4 },
  { unit_no: "8E", col: 16, row: 51, colspan: 1, rowspan: 4 },
];

// The source sheet draws "8T" and "8S" sharing a single merged box.
const DECORATIVE = [
  { label: "8T / 8S", col: 18, row: 25, colspan: 3, rowspan: 4 },
];

// RTH (green open space) regions — cells styled with the sheet's green
// fill (#92d050), extracted and merged the same way as UNIT_GEOMETRY.
const GREEN_AREAS = [
  { col: 1, row: 1, colspan: 3, rowspan: 4 },
  { col: 15, row: 1, colspan: 1, rowspan: 4 },
  { col: 16, row: 1, colspan: 1, rowspan: 3 },
  { col: 6, row: 7, colspan: 9, rowspan: 1 },
  { col: 1, row: 10, colspan: 2, rowspan: 2 },
  { col: 5, row: 10, colspan: 1, rowspan: 8 },
  { col: 5, row: 20, colspan: 1, rowspan: 8 },
  { col: 14, row: 20, colspan: 2, rowspan: 8 },
  { col: 25, row: 36, colspan: 1, rowspan: 4 },
  { col: 1, row: 39, colspan: 1, rowspan: 2 },
];

// Outer perimeter wall — thick continuous bars along the outside edge of
// the built area, drawn as their own grid-line-anchored segments (not
// per-unit borders) so they read as one unbroken wall and can bridge the
// empty gap between 9N and 9M (nothing occupies col3-4 there).
type Wall = {
  side: "left" | "top" | "bottom";
  col: number;
  row: number;
  colspan?: number;
  rowspan?: number;
};

const WALLS: Wall[] = [
  // Left side, 9X down to 9N.
  { side: "left", col: 1, row: 12, rowspan: 22 },
  // Bottom side, 9N across the gap through 9M, 9L, 9K, 9J, 9I. Row 33, not
  // 34: "bottom" aligns to the end of the row it's given, and 33 is the
  // last row these units actually occupy (they end at the row-34 line) —
  // using 34 here left a full row-height gap before the left wall above.
  { side: "bottom", col: 1, row: 33, colspan: 10 },
  // Left side, 9G down past 9A to the bottom of the plan.
  { side: "left", col: 11, row: 34, rowspan: 20 },
  // Top side, 19K through 19A.
  { side: "top", col: 4, row: 1, colspan: 11 },
  // Bottom side, 8A through 8E (Kiwari VII). Row 54, not 55: same
  // last-occupied-row convention as the 9N-9I wall above.
  { side: "bottom", col: 12, row: 54, colspan: 5 },
  // Bottom side, 8L through 8R.
  { side: "bottom", col: 17, row: 39, colspan: 8 },
  // Right side of 8I (down through 8H, 8G, 8F) to the right side of 8E.
  // col 17, not 16: 8I/8H/8G/8F each span cols 15-16 (colspan 2), so col
  // 16 falls inside those boxes rather than at their edge.
  { side: "left", col: 17, row: 40, rowspan: 11 },
  // Right side of 19V down to the right side of 18A.
  { side: "left", col: 17, row: 10, rowspan: 18 },
];

// Approximate anchors for the "Kiwari" zone captions — the source draws
// these as separate graphic labels (not grid text), so their exact
// coordinates aren't in the extracted cell data; placed just above/beside
// their cluster.
const ZONE_LABELS = [
  { label: "Kiwari I", col: 4, row: 0 },
  { label: "Kiwari II", col: 1, row: 9 },
  { label: "Kiwari III", col: 6, row: 9 },
  { label: "Kiwari IV", col: 6, row: 19 },
  { label: "Kiwari V", col: 11, row: 33 },
  { label: "Kiwari VII", col: 12, row: 50 },
];

const MAX_COL = 25;
const MAX_ROW = 54 + ROW_OFFSET;

type Tooltip = {
  unit_no: string;
  name: string;
  alt_names: string | null;
  left: number;
  top: number;
};

export default function DenahMap({ households }: { households: DenahHousehold[] }) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const byUnit = useMemo(() => {
    const m = new Map<string, DenahHousehold>();
    households.forEach((h) => m.set(h.unit_no, h));
    return m;
  }, [households]);

  function handleClick(unitNo: string, e: React.MouseEvent<HTMLButtonElement>) {
    const h = byUnit.get(unitNo);
    if (!h) {
      setTooltip(null);
      return;
    }
    if (tooltip?.unit_no === unitNo) {
      setTooltip(null);
      return;
    }
    setTooltip({
      unit_no: unitNo,
      name: h.name,
      alt_names: h.alt_names,
      left: e.currentTarget.offsetLeft + e.currentTarget.offsetWidth / 2,
      top: e.currentTarget.offsetTop + e.currentTarget.offsetHeight,
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">
        Denah Kiwari Residence
      </h1>
      <p className="text-xs text-gray-400 mb-4">
        Klik satu unit untuk lihat nama kepala keluarga dan pasangan.
      </p>

      <div className="overflow-x-auto -mx-4 px-4 pb-4">
        <div
          className="grid gap-0.5 relative"
          style={{
            gridTemplateColumns: `repeat(${MAX_COL}, minmax(1.9rem, 1fr))`,
            gridTemplateRows: `repeat(${MAX_ROW}, minmax(1.1rem, auto))`,
            minWidth: `${MAX_COL * 2.1}rem`,
          }}
        >
          {GREEN_AREAS.map((g, i) => (
            <div
              key={`green-${i}`}
              style={{
                gridColumn: `${g.col} / span ${g.colspan}`,
                gridRow: `${g.row + ROW_OFFSET} / span ${g.rowspan}`,
                backgroundColor: "#92d050",
              }}
              className="rounded-sm"
            />
          ))}

          {UNIT_GEOMETRY.map((cell) => {
            const h = byUnit.get(cell.unit_no);
            return (
              <button
                key={cell.unit_no}
                type="button"
                onClick={(e) => handleClick(cell.unit_no, e)}
                style={{
                  gridColumn: `${cell.col} / span ${cell.colspan}`,
                  gridRow: `${cell.row + ROW_OFFSET} / span ${cell.rowspan}`,
                }}
                className={`border rounded text-[9px] sm:text-[10px] font-medium flex items-center justify-center px-0.5 transition cursor-pointer hover:brightness-95 ${
                  tooltip?.unit_no === cell.unit_no
                    ? "bg-blue-100 border-blue-400 text-blue-800 ring-2 ring-blue-500"
                    : "bg-white border-gray-300 text-gray-700"
                }`}
                title={h ? `${cell.unit_no} — ${h.name}` : cell.unit_no}
              >
                {cell.unit_no}
              </button>
            );
          })}

          {WALLS.map((w, i) => (
            <div
              key={`wall-${i}`}
              style={{
                gridColumn: `${w.col} / span ${w.colspan ?? 1}`,
                gridRow: `${w.row + ROW_OFFSET} / span ${w.rowspan ?? 1}`,
                backgroundColor: "#374151",
                pointerEvents: "none",
                ...(w.side === "left" && { justifySelf: "start", width: 5, height: "100%" }),
                ...(w.side === "top" && { alignSelf: "start", height: 5, width: "100%" }),
                ...(w.side === "bottom" && { alignSelf: "end", height: 5, width: "100%" }),
              }}
            />
          ))}

          {tooltip && (
            <div
              style={{ left: tooltip.left, top: tooltip.top }}
              className="absolute z-10 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs whitespace-nowrap"
            >
              <p className="font-semibold text-gray-900">{tooltip.unit_no}</p>
              <p className="text-gray-600">{tooltip.name}</p>
              {tooltip.alt_names && (
                <p className="text-gray-600">{tooltip.alt_names}</p>
              )}
            </div>
          )}

          {DECORATIVE.map((d) => (
            <div
              key={d.label}
              style={{
                gridColumn: `${d.col} / span ${d.colspan}`,
                gridRow: `${d.row + ROW_OFFSET} / span ${d.rowspan}`,
              }}
              className="border border-dashed border-gray-200 rounded text-[8px] text-gray-300 flex items-center justify-center text-center px-0.5"
            >
              {d.label}
            </div>
          ))}

          {ZONE_LABELS.map((z) => (
            <div
              key={z.label}
              style={{
                gridColumn: z.col,
                gridRow: z.row + ROW_OFFSET,
              }}
              className="text-[9px] font-semibold text-gray-400 self-end whitespace-nowrap"
            >
              {z.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
