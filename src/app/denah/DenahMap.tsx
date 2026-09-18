"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DenahHousehold, DenahSecurityGuard } from "./page";

// Exact site-plan geometry (unit id, x, y — box is always 16 x 9.8) ported
// from the "Denah Kiwari Residence" site plan artifact. Coordinates sit in
// the plan's own SVG user-space (viewBox origin 208,78 / size 396x292),
// not screen pixels.
const RAW: [string, number, number][] = [
  ["19K", 271.5, 93.5], ["19J", 289.4, 93.5], ["19I", 306.9, 93.5], ["19H", 321.7, 93.5], ["19G", 337.4, 93.5], ["19F", 353.7, 93.5], ["19E", 369.5, 93.5], ["19D", 385, 93.5], ["19C", 400.7, 93.5], ["19B", 416.5, 93.5], ["19A", 432.2, 93.5],
  ["19L", 290.9, 137.6], ["19M", 305.4, 137.6], ["19N", 321.7, 137.6], ["19O", 337.4, 137.6], ["19P", 353.7, 137.6], ["19Q", 368.9, 137.6], ["19R", 385, 137.6], ["19S", 401, 137.6], ["19T", 416.7, 137.6], ["19U", 432, 137.6], ["19V", 451.1, 137.6],
  ["9X", 233.3, 142.6], ["9W", 232.3, 152.4],
  ["18Q", 290.1, 157.3], ["18R", 306.2, 157.3], ["18S", 322.2, 157.3], ["18T", 337.9, 157.3], ["18U", 353.2, 157.3], ["18V", 369.2, 157.3], ["18W", 384.2, 157.3], ["18X", 401, 157.3], ["18Y", 416.7, 157.3], ["18Z", 432.5, 157.3], ["18AA", 449.3, 157.3],
  ["9V", 233.3, 162.2], ["9U", 233.1, 172], ["9T", 233.6, 181.8],
  ["18I", 291.2, 186.7], ["18J", 306.9, 186.7], ["18K", 322.2, 186.7], ["18L", 338.2, 186.7], ["18M", 352.7, 186.7], ["18N", 368.9, 186.7], ["18O", 384.7, 186.7], ["18P", 401, 186.7],
  ["9S", 233.6, 191.6], ["9R", 233.3, 201.5],
  ["18H", 290.1, 206.4], ["18G", 305.9, 206.4], ["18F", 322.2, 206.4], ["18E", 337.9, 206.4], ["18D", 353.4, 206.4], ["18C", 369.2, 206.4], ["18B", 385, 206.4], ["18A", 400.7, 206.4],
  ["8T", 475.3, 211.3], ["8S", 500.1, 211.3],
  ["9Q", 233.1, 211.3], ["9P", 233.3, 221.1], ["9O", 233.1, 230.9],
  ["9M", 289.4, 235.8], ["9L", 308, 235.8], ["9K", 323.5, 235.8], ["9J", 339.8, 235.8], ["9I", 355.8, 235.8], ["9H", 378.2, 235.8],
  ["9N", 233.1, 240.7],
  ["9G", 378.2, 250.5], ["9F", 378.8, 260.4],
  ["8K", 441.5, 260.4],
  ["8L", 468.4, 265.3], ["8M", 486, 265.3], ["8N", 502.5, 265.3], ["8O", 518, 265.3], ["8P", 534.3, 265.3], ["8Q", 549.5, 265.3], ["8R", 565.8, 265.3],
  ["9E", 378.8, 270.2], ["8J", 442.1, 270.2],
  ["9D", 378.2, 280], ["8I", 442.3, 280],
  ["9C", 378.5, 289.8], ["8H", 441.3, 289.8],
  ["9B", 378.5, 299.6], ["8G", 441.3, 299.6],
  ["9A", 378.5, 309.5], ["8F", 441.8, 309.5],
  ["8A", 386.3, 338.9], ["8B", 402.3, 338.9], ["8C", 418, 338.9], ["8D", 433.5, 338.9], ["8E", 449.6, 338.9],
];

type PoiKind = "cctv" | "play" | "pos" | "gardu" | "gate" | "stop" | "arah";

// Optional 5th element is a glyph variant — only "arah" reads it, to tell a
// single-direction arrow apart from a left/right T-junction sign.
const POI: [PoiKind, string, number, number, string?][] = [
  ["cctv", "CCTV lingkungan", 253.7, 229.2],
  ["cctv", "CCTV lingkungan", 399.6, 218.9],
  ["cctv", "CCTV lingkungan", 371.9, 328.7],
  ["play", "Playground", 458.3, 244.2],
  ["pos", "Pos security", 381.1, 353.5],
  ["gardu", "Gardu listrik", 230.6, 104.3],
  ["gate", "Gerbang tertutup", 475.2, 118.6],
  ["stop", "Dilarang melintas", 281.4, 192],
  ["stop", "Dilarang melintas", 449.5, 219.1],
  ["stop", "Dilarang melintas", 466.9, 105.8],
  ["arah", "Arah lalu lintas", 282.2, 176.9],
  ["arah", "Arah kiri / kanan", 407.6, 231.2, "tjunction"],
  ["arah", "Arah lalu lintas", 464.8, 223.7],
];

// Asphalt-textured road surfaces.
const ROAD_RECTS: [number, number, number, number][] = [
  [214.6, 84.5, 271.5, 5.2], [214.6, 89.4, 10, 167.2],
  [470.1, 89.4, 16, 15], [470.1, 104.1, 16, 5.2],
  [470.1, 123.8, 16, 10], [470.1, 133.6, 16, 10],
  [470.1, 143.4, 16, 29.7], [470.1, 172.8, 16, 10.1],
  [470.1, 182.7, 16, 24.8], [485.8, 202.3, 47.6, 5.2],
  [517.4, 207.2, 16, 15], [517.4, 221.9, 16, 5.2],
  [517.4, 226.8, 16, 19.9], [533.1, 241.6, 63.6, 5.1],
  [585.3, 246.5, 11.4, 5.1], [224.4, 251.4, 145.4, 5.2],
  [585.3, 251.4, 11.4, 5.2], [353.8, 256.3, 16, 19.9],
  [585.3, 256.3, 11.4, 5.2], [585.3, 261.2, 11.4, 15],
  [353.8, 275.9, 16, 10.1], [585.3, 275.9, 11.4, 5.2],
  [464.1, 280.8, 132.6, 5.2], [353.8, 285.7, 16, 19.9],
  [464.1, 285.7, 6.2, 19.9], [224.4, 305.4, 16, 10.1],
  [353.8, 305.4, 16, 10.1], [464.1, 305.4, 6.2, 10.1],
  [353.8, 315.2, 16, 44.4], [464.1, 315.2, 6.2, 39.5],
  [385.3, 354.5, 85, 5.1],
];

// RTH (green open space) regions, some with rounded corners (rx).
const RTH_RECTS: [number, number, number, number, number?][] = [
  [224.4, 89.4, 47.5, 19.9], [448.4, 89.4, 21.9, 15],
  [448.4, 104.1, 16, 5.2], [290.8, 118.8, 142.1, 5.2],
  [224.4, 133.6, 31.8, 10], [287.4, 133.6, 3.6, 10],
  [287.4, 143.4, 3.6, 29.7], [464.1, 172.8, 6.2, 10.1],
  [287.4, 182.7, 3.6, 39.5], [416.9, 182.7, 31.7, 39.5],
  [464.1, 182.7, 6.2, 39.5], [464.1, 221.9, 6.2, 5.2],
  [580.4, 261.2, 5.2, 15], [224.4, 275.9, 16, 10.1],
  [580.4, 275.9, 5.2, 5.2], [415.8, 262.5, 4.4, 55.5],
  [417, 230.6, 23.5, 23.7, 1.6], [448.8, 237.6, 55.2, 13.9, 1.6],
];

const ROAD_NAMES: { x: number; y: number; label: string; rotate?: [number, number, number] }[] = [
  { x: 360, y: 123.2, label: "KIWARI I" },
  { x: 272.5, y: 176, label: "KIWARI II", rotate: [-90, 272.5, 176] },
  { x: 374.4, y: 179.8, label: "KIWARI III" },
  { x: 350.4, y: 228.3, label: "KIWARI IV" },
  { x: 535.5, y: 256.7, label: "KIWARI V" },
  { x: 418.6, y: 291.4, label: "KIWARI VI", rotate: [-90, 418.6, 291.4] },
  { x: 426.8, y: 330.5, label: "KIWARI VII" },
];

const BLOKS = ["Semua", "8", "9", "18", "19"] as const;
type Blok = (typeof BLOKS)[number];

type Sel =
  | { kind: "plot"; id: string; blok: string }
  | { kind: "poi"; name: string; poiKind: PoiKind }
  | null;

const INITIAL_VB: [number, number, number, number] = [208, 78, 396, 292];

function blokOf(id: string) {
  return id.match(/^\d+/)![0];
}

function clampVb(v: [number, number, number, number]): [number, number, number, number] {
  const w = Math.max(70, Math.min(396, v[2]));
  const h = (w * 292) / 396;
  return [
    Math.max(208 - 40, Math.min(604 + 40 - w, v[0])),
    Math.max(78 - 40, Math.min(370 + 40 - h, v[1])),
    w,
    h,
  ];
}

// Small facility glyphs, each drawn in an 8x8 box.
function PoiGlyph({ kind, variant }: { kind: PoiKind; variant?: string }) {
  switch (kind) {
    case "cctv":
      return (
        <>
          <path d="M1.1 2.6 L5.6 1.5 L6 2.9 L1.5 4 Z" fill="#006786" />
          <path d="M3 4 L3.4 5.2 M2.2 5.2 h2.2" stroke="#006786" strokeWidth={0.6} fill="none" strokeLinecap="round" />
          <circle cx={6.4} cy={2.2} r={0.6} fill="#d6006c" />
        </>
      );
    case "play":
      return (
        <>
          <path d="M2 6.3 V2.2 h1.3 V6.3" stroke="#006786" strokeWidth={0.6} fill="none" />
          <path d="M3.3 2.4 C5.2 2.6 5.4 4.6 6.4 6.3" stroke="#006786" strokeWidth={0.6} fill="none" strokeLinecap="round" />
          <path d="M2 4.2 h1.3" stroke="#006786" strokeWidth={0.5} />
        </>
      );
    case "pos":
      return (
        <>
          <path d="M1.4 3.4 L4 1.6 L6.6 3.4 Z" fill="#006786" />
          <rect x={2.2} y={3.6} width={3.6} height={2.9} fill="none" stroke="#006786" strokeWidth={0.6} />
          <rect x={3.2} y={4.4} width={1.6} height={1.2} fill="#006786" />
        </>
      );
    case "gardu":
      return <path d="M4.6 1.2 L2.2 4.5 h1.5 L3.2 6.9 L5.8 3.4 H4.2 Z" fill="#006786" />;
    case "gate":
      // Closed gate: two posts with an X-braced panel between them.
      return (
        <>
          <path d="M1.5 1.4 V6.6 M6.5 1.4 V6.6" stroke="#006786" strokeWidth={0.6} strokeLinecap="round" />
          <path
            d="M1.5 2.1 H6.5 M1.5 2.1 L6.5 6.1 M6.5 2.1 L1.5 6.1"
            stroke="#006786"
            strokeWidth={0.5}
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case "stop":
      return (
        <>
          <circle cx={4} cy={4} r={2.8} fill="none" stroke="#d6006c" strokeWidth={0.7} />
          <rect x={2} y={3.5} width={4} height={1} fill="#d6006c" />
        </>
      );
    case "arah":
      // Indonesian mandatory-direction road sign (rambu perintah): a blue
      // disc with a white rim, rather than a bare arrow — reads as an
      // actual traffic sign at marker scale. The "tjunction" variant is a
      // T-shape (stem + crossbar with arrowheads both ends) for a spot
      // where traffic can only turn left or right, not go straight.
      return variant === "tjunction" ? (
        <>
          <circle cx={4} cy={4} r={3.3} fill="#1d4ed8" stroke="#ffffff" strokeWidth={0.5} />
          <path
            d="M4 3.3 V6.2 M1.7 3.3 H6.3 M2.7 2.2 L1.7 3.3 L2.7 4.4 M5.3 2.2 L6.3 3.3 L5.3 4.4"
            stroke="#ffffff"
            strokeWidth={0.7}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle cx={4} cy={4} r={3.3} fill="#1d4ed8" stroke="#ffffff" strokeWidth={0.5} />
          <path
            d="M1.9 4 H5.6 M4 2.3 L5.7 4 L4 5.7"
            stroke="#ffffff"
            strokeWidth={0.8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
  }
}

const LEGEND: { kind: PoiKind; label: string }[] = [
  { kind: "cctv", label: "CCTV lingkungan" },
  { kind: "play", label: "Playground" },
  { kind: "pos", label: "Pos security" },
  { kind: "gardu", label: "Gardu listrik" },
  { kind: "gate", label: "Gerbang tertutup" },
  { kind: "stop", label: "Dilarang melintas" },
  { kind: "arah", label: "Arah lalu lintas" },
];

export default function DenahMap({
  households,
  securityGuards,
}: {
  households: DenahHousehold[];
  securityGuards: DenahSecurityGuard[];
}) {
  const [sel, setSel] = useState<Sel>(null);
  const [blok, setBlok] = useState<Blok>("Semua");
  const [q, setQ] = useState("");
  const [vb, setVb] = useState(INITIAL_VB);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ mx: number; my: number; vb: [number, number, number, number] } | null>(null);
  const vbRef = useRef(vb);
  useEffect(() => {
    vbRef.current = vb;
  }, [vb]);

  const byUnit = useMemo(() => {
    const m = new Map<string, DenahHousehold>();
    households.forEach((h) => m.set(h.unit_no, h));
    return m;
  }, [households]);

  function zoom(f: number, cx?: number, cy?: number) {
    setVb(([x, y, w, h]) => {
      const px = cx ?? x + w / 2;
      const py = cy ?? y + h / 2;
      const nw = w * f;
      const nh = h * f;
      return clampVb([px - (px - x) * f, py - (py - y) * f, nw, nh]);
    });
  }

  // React marks onWheel as a passive listener, so preventDefault() there is
  // silently ignored (and warns) — attach natively to actually stop page
  // scroll while zooming the map.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = el!.getBoundingClientRect();
      const [x, y, w, h] = vbRef.current;
      zoom(
        e.deltaY > 0 ? 1.12 : 0.89,
        x + ((e.clientX - r.left) / r.width) * w,
        y + ((e.clientY - r.top) / r.height) * h
      );
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    dragRef.current = { mx: e.clientX, my: e.clientY, vb };
  }
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const d = dragRef.current;
    if (!d) return;
    const r = e.currentTarget.getBoundingClientRect();
    const k = d.vb[2] / r.width;
    setVb(clampVb([d.vb[0] - (e.clientX - d.mx) * k, d.vb[1] - (e.clientY - d.my) * k, d.vb[2], d.vb[3]]));
  }
  function handleMouseUp() {
    dragRef.current = null;
  }

  function handlePick(e: React.MouseEvent<SVGGElement>) {
    const target = (e.target as SVGElement).closest("[data-id]");
    if (!target) return;
    const id = target.getAttribute("data-id")!;
    setSel({ kind: "plot", id, blok: blokOf(id) });
  }

  const qUpper = q.trim().toUpperCase();
  const filtering = blok !== "Semua" || !!qUpper;

  const { marks, matches } = useMemo(() => {
    const marks: { x: number; y: number; fill: string; stroke: string; sw: number }[] = [];
    let matches = 0;
    RAW.forEach(([id, x, y]) => {
      const h = byUnit.get(id);
      const nameMatch =
        !!h &&
        (h.name.toUpperCase().includes(qUpper) ||
          (h.alt_names?.toUpperCase().includes(qUpper) ?? false));
      const on =
        (blok === "Semua" || blokOf(id) === blok) &&
        (!qUpper || id.startsWith(qUpper) || nameMatch);
      if (on) matches++;
      if (filtering && on) marks.push({ x, y, fill: "none", stroke: "#d6006c", sw: 0.8 });
    });
    if (sel?.kind === "plot") {
      const selPlot = RAW.find((r) => r[0] === sel.id);
      if (selPlot) marks.push({ x: selPlot[1], y: selPlot[2], fill: "#cbeeff", stroke: "#0088b0", sw: 1 });
    }
    return { marks, matches };
  }, [blok, qUpper, filtering, sel, byUnit]);

  const counts = useMemo(
    () => (["8", "9", "18", "19"] as const).map((b) => ({ label: "Blok " + b, n: RAW.filter((r) => blokOf(r[0]) === b).length })),
    []
  );

  const selHousehold = sel?.kind === "plot" ? byUnit.get(sel.id) : undefined;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div className="flex-1 min-w-[280px]">
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 leading-tight">
            Denah Kiwari Residence
          </h1>
        </div>
        <div className="text-sm text-gray-500">
          93 rumah · Blok 8, 9, 18, 19 · Jalan Kiwari I–VII
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex-1 min-w-[320px]" style={{ flexBasis: 560 }}>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              type="search"
              placeholder="Cari nomor rumah atau nama, mis. 19K / Budi"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex gap-1.5 flex-wrap">
              {BLOKS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setBlok(b);
                    setQ("");
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    blok === b
                      ? "bg-blue-600 text-white"
                      : "border border-blue-200 text-blue-700 hover:bg-blue-50"
                  }`}
                >
                  {b === "Semua" ? "Semua" : "Blok " + b}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 ml-auto">
              <button
                type="button"
                onClick={() => zoom(1 / 0.7)}
                className="w-8 h-8 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => zoom(0.7)}
                className="w-8 h-8 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => {
                  setVb(INITIAL_VB);
                  setSel(null);
                  setQ("");
                  setBlok("Semua");
                }}
                className="px-3 h-8 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
              >
                Reset
              </button>
            </div>
          </div>

          <svg
            ref={svgRef}
            viewBox={vb.map((n) => Math.round(n * 10) / 10).join(" ")}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="w-full h-auto bg-white shadow-sm cursor-grab active:cursor-grabbing select-none rounded-sm"
            style={{ aspectRatio: "396/292", touchAction: "none", display: "block" }}
          >
            <defs>
              <pattern id="rth" width={4} height={4} patternUnits="userSpaceOnUse">
                <rect width={4} height={4} fill="#e8f4e0" />
                <circle cx={1} cy={1} r={0.55} fill="#8cc06a" />
                <circle cx={3} cy={3} r={0.55} fill="#8cc06a" />
              </pattern>
              <pattern id="asphalt" width={3} height={3} patternUnits="userSpaceOnUse">
                <rect width={3} height={3} fill="#eae7e7" />
                <circle cx={1.5} cy={1.5} r={0.3} fill="#d7d3d3" />
              </pattern>
            </defs>

            <g>
              <rect x={208} y={78} width={396} height={292} fill="#ffffff" />
              <g fill="url(#asphalt)">
                {ROAD_RECTS.map(([x, y, w, h], i) => (
                  <rect key={i} x={x} y={y} width={w} height={h} />
                ))}
              </g>
              <g fill="url(#rth)" stroke="#8cc06a" strokeWidth={0.3}>
                {RTH_RECTS.map(([x, y, w, h, rx], i) => (
                  <rect key={i} x={x} y={y} width={w} height={h} rx={rx} />
                ))}
              </g>
            </g>

            <g onClick={handlePick} style={{ cursor: "pointer" }}>
              <g fill="#ffffff" stroke="#bab6b6" strokeWidth={0.25}>
                {RAW.map(([id, x, y]) => {
                  const h = byUnit.get(id);
                  return (
                    <rect
                      key={id}
                      data-id={id}
                      x={x}
                      y={y}
                      width={16}
                      height={9.8}
                      className="transition-colors hover:fill-gray-50"
                    >
                      <title>{h ? `${id} — ${h.name}` : id}</title>
                    </rect>
                  );
                })}
              </g>
              <g style={{ pointerEvents: "none" }}>
                {marks.map((m, i) => (
                  <rect key={i} x={m.x} y={m.y} width={16} height={9.8} fill={m.fill} stroke={m.stroke} strokeWidth={m.sw} />
                ))}
              </g>
              <g textAnchor="middle" fontSize={5.2} fill="#201e1d" style={{ pointerEvents: "none", userSelect: "none" }}>
                {RAW.map(([id, x, y]) => (
                  <text key={id} x={x + 8} y={y + 7.1} fontSize={id.length >= 4 ? 4.4 : undefined}>
                    {id}
                  </text>
                ))}
              </g>
            </g>

            <g fontSize={4.4} fill="#201e1d" letterSpacing={0.6} textAnchor="middle" style={{ pointerEvents: "none" }}>
              {ROAD_NAMES.map((r, i) => (
                <text key={i} x={r.x} y={r.y} transform={r.rotate ? `rotate(${r.rotate.join(" ")})` : undefined}>
                  {r.label}
                </text>
              ))}
            </g>

            <g>
              {POI.map(([kind, name, cx, cy, variant], i) => (
                <g
                  key={i}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSel({ kind: "poi", name, poiKind: kind })}
                >
                  <circle cx={cx} cy={cy} r={4.6} fill="#ffffff" />
                  <g transform={`translate(${cx - 3.2}, ${cy - 3.2})`}>
                    <PoiGlyph kind={kind} variant={variant} />
                  </g>
                </g>
              ))}
            </g>

            <g stroke="#201e1d" strokeWidth={0.4} fill="none">
              <path d="M570 92 V70 M566.4 74.2 L570 69.4 L573.6 74.2" />
            </g>
            <text x={570} y={99} textAnchor="middle" fontSize={5} fill="#201e1d">
              U
            </text>

            <g stroke="#bab6b6" strokeWidth={0.3} fill="none">
              <path d="M212 82 h6 M215 79 v6" />
              <path d="M594 82 h6 M597 79 v6" />
              <path d="M212 364 h6 M215 361 v6" />
              <path d="M594 364 h6 M597 361 v6" />
            </g>
          </svg>

          <p className="text-sm text-gray-500 mt-3">
            Klik rumah atau ikon fasilitas · scroll untuk zoom · geser untuk menggeser peta
          </p>
        </div>

        <aside className="flex-1 min-w-[260px] max-w-[340px]">
          <div className="min-h-[150px] mb-8">
            <div className="text-xs tracking-widest uppercase text-gray-500 mb-1">
              {sel?.kind === "plot" ? "Blok " + sel.blok : sel?.kind === "poi" ? "Fasilitas" : "Rumah"}
            </div>
            <div className="font-semibold text-3xl text-gray-900 mb-2">
              {sel?.kind === "plot" ? sel.id : sel?.kind === "poi" ? sel.name : "Pilih rumah"}
            </div>
            <div className="mb-3">
              {sel?.kind === "plot" ? (
                <span
                  className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${
                    selHousehold ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {selHousehold ? selHousehold.name : "Belum ada data"}
                </span>
              ) : sel?.kind === "poi" ? (
                <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border border-blue-200 text-blue-700">
                  Fasilitas lingkungan
                </span>
              ) : (
                <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                  {matches} rumah tampil
                </span>
              )}
            </div>
            <div className="text-sm leading-relaxed text-gray-700">
              {sel?.kind === "plot" ? (
                selHousehold ? (
                  <div>
                    <p className="text-gray-500">Penghuni:</p>
                    <ul>
                      {[
                        selHousehold.name,
                        ...(selHousehold.alt_names
                          ? selHousehold.alt_names.split(",").map((n) => n.trim()).filter(Boolean)
                          : []),
                      ].map((name, i) => (
                        <li key={i} className="font-medium text-gray-900">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p>Data penghuni untuk rumah {sel.id} belum tercatat di sistem.</p>
                )
              ) : sel?.kind === "poi" ? (
                sel.poiKind === "pos" ? (
                  securityGuards.length > 0 ? (
                    <div>
                      <p className="text-gray-500">Anggota security:</p>
                      <ul>
                        {securityGuards.map((g) => (
                          <li key={g.name} className="font-medium text-gray-900">
                            {g.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p>Data anggota security belum tercatat di sistem.</p>
                  )
                ) : (
                  <p>{sel.name} berada pada titik yang ditandai di denah.</p>
                )
              ) : (
                <p>
                  Klik salah satu rumah pada denah untuk melihat nomor, blok, dan penghuninya. Gunakan
                  pencarian atau filter blok untuk menemukan alamat tertentu.
                </p>
              )}
            </div>
            {sel && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setSel(null)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Tutup
                </button>
              </div>
            )}
          </div>

          <div className="mb-8">
            <div className="text-xs tracking-widest uppercase text-gray-500 mb-3">Legenda</div>
            <div className="flex flex-col gap-2 text-sm">
              {LEGEND.map((l) => (
                <div key={l.kind} className="flex items-center gap-3">
                  <svg viewBox="0 0 8 8" width={18} height={18}>
                    <PoiGlyph kind={l.kind} />
                  </svg>
                  {l.label}
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="w-5 h-3.5 inline-block" style={{ background: "#e8f4e0", border: "1px solid #8cc06a" }} />
                RTH / taman
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs tracking-widest uppercase text-gray-500 mb-3">Jumlah rumah</div>
            <table className="w-full text-sm">
              <tbody>
                {counts.map((r) => (
                  <tr key={r.label} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-700">{r.label}</td>
                    <td className="py-1.5 text-right text-gray-900">{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </div>
    </div>
  );
}
