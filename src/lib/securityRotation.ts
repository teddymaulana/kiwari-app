import type { ShiftType } from "@/lib/types";

// The fixed 5-day rotation every guard follows, per Jadwal Security
// Oktober 2026 (Jadwal_Security_Oktober2026.pdf) — each guard runs this
// same cycle starting from a different offset, which keeps daily coverage
// at exactly 2 Pagi + 2 Malam + 1 OFF. (September used an older
// OFF/Pagi/OFF/Malam/Malam cycle with 1 Pagi + 2 Malam + 2 OFF; those rows
// stay as recorded, this only drives generating new months.) No two
// rotations of this sequence are identical, so matching a guard's last
// few days against it uniquely pins down where they are in the cycle (see
// findOffsetAfter below).
export const ROTATION_CYCLE: ShiftType[] = ["pagi", "pagi", "malam", "malam", "off"];

function isNextCalendarDay(dateStr: string, nextDateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
  return expected === nextDateStr;
}

// Given a guard's shifts sorted ascending by date, returns the rotation
// offset for the day right after the last one — or null if the tail
// isn't a clean run of consecutive calendar days matching the known
// cycle (e.g. gaps in the data, or a manual override that broke the
// pattern), in which case the caller should fall back to asking a
// pengurus to enter that guard's next shift manually rather than guess.
export function findOffsetAfter(
  shifts: { shift_date: string; shift_type: ShiftType }[]
): number | null {
  // Walk backward from the most recent shift, keeping only the
  // consecutive-day run at the tail (up to 5 days — enough to uniquely
  // determine the offset given the cycle has no rotational symmetry).
  const tail: { shift_date: string; shift_type: ShiftType }[] = [];
  for (let i = shifts.length - 1; i >= 0 && tail.length < 5; i--) {
    if (tail.length === 0 || isNextCalendarDay(shifts[i].shift_date, tail[0].shift_date)) {
      tail.unshift(shifts[i]);
    } else {
      break;
    }
  }
  if (tail.length === 0) return null;

  for (let offset = 0; offset < 5; offset++) {
    const matches = tail.every(
      (s, i) => ROTATION_CYCLE[(offset + i) % 5] === s.shift_type
    );
    if (matches) return (offset + tail.length) % 5;
  }
  return null;
}

// Generates `days` consecutive shift_type values starting at startDate,
// given the rotation offset for startDate itself.
export function generateRotationShifts(
  offsetForStartDate: number,
  startDate: string,
  days: number
): { shift_date: string; shift_type: ShiftType }[] {
  const start = new Date(startDate + "T00:00:00");
  const result: { shift_date: string; shift_type: ShiftType }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const shift_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    result.push({ shift_date, shift_type: ROTATION_CYCLE[(offsetForStartDate + i) % 5] });
  }
  return result;
}
