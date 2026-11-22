// Shared bits of Arsip Foto (Kehadiran & Patroli page): monthly ZIP of
// absen + patroli photos, after which that month's photos can be deleted
// from storage to stay within the Supabase free plan's 1 GB.

const TZ = "Asia/Jakarta";

export function jakartaMonth() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7);
}

// "YYYY-MM" → first/last shift_date of that month, or null if invalid.
export function monthRange(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  const last = new Date(year, mon, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

// e.g. "2026-11-03_0712_Pagi_Budi_Absen-Masuk_1a2b3c.jpg" — sorts by date
// and time; the id suffix keeps names unique.
export function photoArchiveName(p: {
  shift_date: string;
  at: string;
  shift_type: string;
  guard: string;
  label: string;
  path: string;
}) {
  const time = new Date(p.at)
    .toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
    .replace(":", "");
  const shift = p.shift_type === "malam" ? "Malam" : "Pagi";
  const guard = p.guard.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "petugas";
  const ext = (p.path.split(".").pop() || "jpg").toLowerCase();
  const suffix = p.path.split("/").pop()!.replace(/\.[^.]+$/, "").slice(-6);
  return `${p.shift_date}_${time}_${shift}_${guard}_${p.label}_${suffix}.${ext}`;
}

export type ArchivePhoto = {
  kind: "checkin" | "patrol";
  id: string;
  name: string;
  url: string;
};
