import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, SECURITY_KEHADIRAN_ACCESS } from "@/lib/auth";
import { ABSEN_TRACKING_START, guardRank } from "@/lib/securityApp";
import { MONTH_NAMES } from "@/lib/types";

// Rekap Absensi & Patroli for one month as a formatted Excel file
// (?month=YYYY-MM), from the Kehadiran & Patroli page. Excel rather than
// CSV so the status colors survive in a spreadsheet. Same access as that
// page (Pengurus Keamanan). Three sheets:
// - Rekap Absensi: guards × days grid, colored by absen status, + totals
// - Detail per Shift: masuk/pulang/patroli times per guard per shift
// - Laporan Patroli: every report with its text and a photo link
// Rejected absen don't count. Times are Jakarta time.

const TZ = "Asia/Jakarta";
const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

type ShiftType = "pagi" | "malam";
type Status = "both" | "masuk" | "pulang" | "none";

// Fills (ARGB) — same meaning as the colors on /security.
const COLOR = {
  header: "FF1F2937",
  headerText: "FFFFFFFF",
  title: "FF111827",
  muted: "FF6B7280",
  border: "FFE5E7EB",
  off: "FFF3F4F6",
  offText: "FF9CA3AF",
  weekend: "FFFAFAFA",
};
const STATUS: Record<Status, { fill: string; text: string; mark: string; label: string }> = {
  both: { fill: "FFD1FAE5", text: "FF047857", mark: "✓✓", label: "Masuk & pulang" },
  masuk: { fill: "FFFEF3C7", text: "FFB45309", mark: "M", label: "Hanya masuk" },
  pulang: { fill: "FFE0F2FE", text: "FF0369A1", mark: "P", label: "Hanya pulang" },
  none: { fill: "FFFEE2E2", text: "FFB91C1C", mark: "✕", label: "Tidak absen" },
};

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin: ExcelJS.Border = { style: "thin", color: { argb: COLOR.border } };
const box: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

function clock(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}
function dateLabel(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
function jakartaToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = fill(COLOR.header);
    cell.font = { bold: true, color: { argb: COLOR.headerText }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = box;
  });
  row.height = 30;
}

function addTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string, width: number) {
  ws.mergeCells(1, 1, 1, width);
  ws.mergeCells(2, 1, 2, width);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: COLOR.title } };
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { size: 10, color: { argb: COLOR.muted } };
  ws.getRow(1).height = 22;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus" || !SECURITY_KEHADIRAN_ACCESS.includes(user.email)) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const monthParam = request.nextUrl.searchParams.get("month") ?? "";
  const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
  const today = jakartaToday();
  const [year, month] = match
    ? [Number(match[1]), Number(match[2])]
    : [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  if (month < 1 || month > 12) {
    return NextResponse.json({ error: "Bulan tidak valid" }, { status: 400 });
  }
  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const from = `${year}-${mm}-01`;
  const to = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;
  const periodLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const supabase = await createClient();
  const [guardsRes, shiftsRes, checkinsRes, patrolsRes] = await Promise.all([
    supabase
      .from("security_guards")
      .select("id, name, is_active, needs_patrol")
      .returns<{ id: string; name: string; is_active: boolean; needs_patrol: boolean | null }[]>(),
    supabase
      .from("security_shifts")
      .select("guard_id, shift_date, shift_type")
      .gte("shift_date", from)
      .lte("shift_date", to)
      .returns<{ guard_id: string; shift_date: string; shift_type: string }[]>(),
    supabase
      .from("security_checkins")
      .select("guard_id, shift_date, shift_type, checkin_type, status, checked_in_at, captured_at")
      .gte("shift_date", from)
      .lte("shift_date", to)
      .neq("status", "rejected")
      .returns<
        {
          guard_id: string;
          shift_date: string;
          shift_type: ShiftType;
          checkin_type: "masuk" | "pulang" | null;
          checked_in_at: string;
          captured_at: string | null;
        }[]
      >(),
    supabase
      .from("security_patrols")
      .select("id, guard_id, shift_date, shift_type, report, patrol_no, submitted_at, captured_at, photo_path")
      .gte("shift_date", from)
      .lte("shift_date", to)
      .returns<
        {
          id: string;
          guard_id: string;
          shift_date: string;
          shift_type: ShiftType;
          report: string;
          patrol_no: number;
          submitted_at: string;
          captured_at: string | null;
          photo_path: string | null;
        }[]
      >(),
  ]);
  const failed = guardsRes.error ?? shiftsRes.error ?? checkinsRes.error ?? patrolsRes.error;
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 });

  const shifts = shiftsRes.data ?? [];
  const checkins = checkinsRes.data ?? [];
  const patrols = patrolsRes.data ?? [];

  // Active guards, plus any former guard with records this month.
  const withData = new Set([...checkins, ...patrols].map((r) => r.guard_id));
  const guards = (guardsRes.data ?? [])
    .filter((g) => g.is_active || withData.has(g.id))
    .sort((a, b) => guardRank(a.name) - guardRank(b.name) || a.name.localeCompare(b.name));
  const nameOf = new Map(guards.map((g) => [g.id, g.name]));

  // Per guard per shift (date + Pagi/Malam).
  type Slot = {
    guard_id: string;
    shift_date: string;
    shift_type: ShiftType;
    scheduled: boolean;
    masuk?: string;
    pulang?: string;
    patrols: (typeof patrols)[number][];
  };
  const slots = new Map<string, Slot>();
  const slotOf = (guard_id: string, shift_date: string, shift_type: ShiftType) => {
    const key = `${guard_id}|${shift_date}|${shift_type}`;
    let s = slots.get(key);
    if (!s) {
      s = { guard_id, shift_date, shift_type, scheduled: false, patrols: [] };
      slots.set(key, s);
    }
    return s;
  };
  const scheduleType = new Map<string, string>(); // guard|date -> pagi/malam/off
  shifts.forEach((sh) => {
    scheduleType.set(`${sh.guard_id}|${sh.shift_date}`, sh.shift_type);
    if (sh.shift_type === "pagi" || sh.shift_type === "malam") {
      slotOf(sh.guard_id, sh.shift_date, sh.shift_type).scheduled = true;
    }
  });
  checkins.forEach((c) => {
    const s = slotOf(c.guard_id, c.shift_date, c.shift_type);
    s[c.checkin_type === "pulang" ? "pulang" : "masuk"] = c.captured_at ?? c.checked_in_at;
  });
  patrols.forEach((p) => slotOf(p.guard_id, p.shift_date, p.shift_type).patrols.push(p));
  slots.forEach((s) => s.patrols.sort((a, b) => a.patrol_no - b.patrol_no));

  const statusOf = (s: Slot): Status | null => {
    if (s.masuk && s.pulang) return "both";
    if (s.masuk) return "masuk";
    if (s.pulang) return "pulang";
    // Missed only counts for past shifts since the app went live.
    return s.scheduled && s.shift_date < today && s.shift_date >= ABSEN_TRACKING_START
      ? "none"
      : null;
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Kiwari App";
  wb.created = new Date();

  // ── Sheet 1: Rekap Absensi (grid) ──────────────────────────────────
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = `${year}-${mm}-${String(i + 1).padStart(2, "0")}`;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return { date, day: i + 1, dow };
  });
  const totalsHeaders = [
    "Shift Terjadwal",
    "Masuk & Pulang",
    "Hanya Masuk",
    "Hanya Pulang",
    "Tidak Absen",
    "Patroli",
  ];
  const gridWidth = 1 + days.length + totalsHeaders.length;
  const ws1 = wb.addWorksheet("Rekap Absensi", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 4 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  addTitle(
    ws1,
    `Rekap Absensi Security — ${periodLabel}`,
    `Kiwari Residence · dibuat ${dateLabel(today)} · jam = waktu di HP petugas (WIB)`,
    gridWidth
  );
  const head = ws1.getRow(4);
  head.values = ["Nama", ...days.map((d) => `${DAY_NAMES[d.dow]}\n${d.day}`), ...totalsHeaders];
  styleHeader(head);
  ws1.getColumn(1).width = 14;
  days.forEach((_, i) => (ws1.getColumn(i + 2).width = 7.5));
  totalsHeaders.forEach((_, i) => (ws1.getColumn(days.length + 2 + i).width = 10));

  guards.forEach((g, gi) => {
    const row = ws1.getRow(5 + gi);
    const totals = { scheduled: 0, both: 0, masuk: 0, pulang: 0, none: 0, patrols: 0 };
    row.getCell(1).value = g.name;
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(1).border = box;
    days.forEach((d, di) => {
      const cell = row.getCell(2 + di);
      const sched = scheduleType.get(`${g.id}|${d.date}`);
      const worked = (["pagi", "malam"] as const)
        .map((t) => slots.get(`${g.id}|${d.date}|${t}`))
        .find((s) => s && (s.masuk || s.pulang || s.patrols.length || s.scheduled));
      const status = worked ? statusOf(worked) : null;
      if (worked?.scheduled) totals.scheduled++;
      if (status) totals[status]++;
      totals.patrols += worked?.patrols.length ?? 0;

      const shiftLetter = worked ? (worked.shift_type === "pagi" ? "Pagi" : "Malam") : sched === "off" ? "OFF" : "";
      cell.value = status ? `${shiftLetter} ${STATUS[status].mark}` : shiftLetter;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = box;
      cell.font = { size: 9, color: { argb: COLOR.muted } };
      if (status) {
        cell.fill = fill(STATUS[status].fill);
        cell.font = { size: 9, bold: true, color: { argb: STATUS[status].text } };
      } else if (shiftLetter === "OFF" || !shiftLetter) {
        cell.fill = fill(COLOR.off);
        cell.font = { size: 9, color: { argb: COLOR.offText } };
      }
      if (worked && !worked.scheduled) {
        cell.note = "Di luar jadwal (tukar shift)";
      }
    });
    const base = 2 + days.length;
    const values = [
      totals.scheduled,
      totals.both,
      totals.masuk,
      totals.pulang,
      totals.none,
      g.needs_patrol === false ? "—" : totals.patrols,
    ];
    values.forEach((v, i) => {
      const cell = row.getCell(base + i);
      cell.value = v;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = box;
      cell.font = { bold: true, size: 10 };
      const key = (["", "both", "masuk", "pulang", "none", ""] as const)[i];
      if (key) {
        cell.fill = fill(STATUS[key].fill);
        cell.font = { bold: true, size: 10, color: { argb: STATUS[key].text } };
      }
    });
    row.height = 20;
  });

  // Legend
  let lr = 5 + guards.length + 2;
  ws1.getCell(lr, 1).value = "Keterangan";
  ws1.getCell(lr, 1).font = { bold: true, size: 10 };
  (Object.keys(STATUS) as Status[]).forEach((k) => {
    lr++;
    const mark = ws1.getCell(lr, 1);
    mark.value = STATUS[k].mark;
    mark.fill = fill(STATUS[k].fill);
    mark.font = { bold: true, color: { argb: STATUS[k].text } };
    mark.alignment = { horizontal: "center" };
    mark.border = box;
    ws1.mergeCells(lr, 2, lr, 8);
    ws1.getCell(lr, 2).value = STATUS[k].label;
    ws1.getCell(lr, 2).font = { size: 10 };
  });
  lr++;
  ws1.mergeCells(lr, 1, lr, gridWidth);
  ws1.getCell(lr, 1).value =
    `"Tidak absen" dihitung sejak ${dateLabel(ABSEN_TRACKING_START)} (aplikasi mulai dipakai). Sel dengan catatan (segitiga kecil di pojok) = di luar jadwal (tukar shift). Absen yang ditolak pengurus tidak dihitung.`;
  ws1.getCell(lr, 1).font = { size: 9, italic: true, color: { argb: COLOR.muted } };

  // ── Sheet 2: Detail per Shift ──────────────────────────────────────
  const ws2 = wb.addWorksheet("Detail per Shift", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  const detailHeaders = [
    "Tanggal",
    "Hari",
    "Nama",
    "Shift",
    "Jadwal",
    "Jam Masuk",
    "Jam Pulang",
    "Status",
    "Patroli 1",
    "Patroli 2",
    "Patroli 3",
  ];
  addTitle(ws2, `Detail Absensi & Patroli per Shift — ${periodLabel}`, "Satu baris per petugas per shift (WIB).", detailHeaders.length);
  styleHeader(ws2.getRow(4));
  ws2.getRow(4).values = detailHeaders;
  styleHeader(ws2.getRow(4));
  [12, 7, 14, 9, 15, 11, 11, 16, 10, 10, 10].forEach((w, i) => (ws2.getColumn(i + 1).width = w));

  const detail = [...slots.values()]
    .filter((s) => nameOf.has(s.guard_id) && (s.masuk || s.pulang || s.patrols.length || statusOf(s)))
    .sort(
      (a, b) =>
        a.shift_date.localeCompare(b.shift_date) ||
        (a.shift_type === b.shift_type ? 0 : a.shift_type === "pagi" ? -1 : 1) ||
        guardRank(nameOf.get(a.guard_id)!) - guardRank(nameOf.get(b.guard_id)!)
    );
  detail.forEach((s, i) => {
    const status = statusOf(s);
    const guard = guards.find((g) => g.id === s.guard_id);
    const p = (n: number) => clock(s.patrols.find((x) => x.patrol_no === n)?.captured_at ?? s.patrols.find((x) => x.patrol_no === n)?.submitted_at);
    const row = ws2.getRow(5 + i);
    row.values = [
      dateLabel(s.shift_date),
      DAY_NAMES[new Date(`${s.shift_date}T00:00:00Z`).getUTCDay()],
      nameOf.get(s.guard_id),
      s.shift_type === "pagi" ? "Pagi" : "Malam",
      s.scheduled ? "Sesuai jadwal" : "Di luar jadwal",
      clock(s.masuk),
      clock(s.pulang),
      status ? STATUS[status].label : "",
      ...(guard?.needs_patrol === false ? ["—", "—", "—"] : [p(1), p(2), p(3)]),
    ];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > detailHeaders.length) return;
      cell.border = box;
      cell.font = { size: 10 };
      cell.alignment = { vertical: "middle", horizontal: col === 3 || col === 5 || col === 8 ? "left" : "center" };
    });
    if (!s.scheduled) row.getCell(5).font = { size: 10, color: { argb: "FFC2410C" } };
    if (status) {
      const st = row.getCell(8);
      st.fill = fill(STATUS[status].fill);
      st.font = { size: 10, bold: true, color: { argb: STATUS[status].text } };
    }
    if (i % 2 === 1) {
      [1, 2, 3, 4, 5, 6, 7, 9, 10, 11].forEach((c) => (row.getCell(c).fill = fill(COLOR.weekend)));
    }
  });
  if (detail.length > 0) {
    ws2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + detail.length, column: detailHeaders.length } };
  }

  // ── Sheet 3: Laporan Patroli ───────────────────────────────────────
  const ws3 = wb.addWorksheet("Laporan Patroli", { views: [{ state: "frozen", ySplit: 4 }] });
  const patrolHeaders = ["Tanggal", "Nama", "Shift", "Patroli ke-", "Jam", "Laporan", "Foto"];
  addTitle(ws3, `Laporan Patroli — ${periodLabel}`, "Foto dibuka lewat website Kiwari (perlu login pengurus).", patrolHeaders.length);
  ws3.getRow(4).values = patrolHeaders;
  styleHeader(ws3.getRow(4));
  [12, 14, 9, 10, 8, 60, 12].forEach((w, i) => (ws3.getColumn(i + 1).width = w));
  const origin = request.nextUrl.origin;
  const patrolRows = patrols
    .filter((p) => nameOf.has(p.guard_id))
    .sort(
      (a, b) =>
        a.shift_date.localeCompare(b.shift_date) ||
        (a.captured_at ?? a.submitted_at).localeCompare(b.captured_at ?? b.submitted_at)
    );
  patrolRows.forEach((p, i) => {
    const row = ws3.getRow(5 + i);
    row.values = [
      dateLabel(p.shift_date),
      nameOf.get(p.guard_id),
      p.shift_type === "pagi" ? "Pagi" : "Malam",
      p.patrol_no,
      clock(p.captured_at ?? p.submitted_at),
      p.report,
      p.photo_path ? { text: "Lihat foto", hyperlink: `${origin}/api/bukti/patrol/${p.id}` } : "",
    ];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > patrolHeaders.length) return;
      cell.border = box;
      cell.font = { size: 10 };
      cell.alignment = { vertical: "top", horizontal: col === 6 || col === 2 ? "left" : "center", wrapText: col === 6 };
      if (i % 2 === 1) cell.fill = fill(COLOR.weekend);
    });
    if (p.photo_path) row.getCell(7).font = { size: 10, color: { argb: "FF2563EB" }, underline: true };
  });
  if (patrolRows.length > 0) {
    ws3.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + patrolRows.length, column: patrolHeaders.length } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rekap-absensi-patroli-${year}-${mm}.xlsx"`,
    },
  });
}
