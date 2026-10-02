// One-time import: replaces the October 2026 security schedule with the
// new roster from Jadwal_Security_Oktober2026.pdf — Septi joins (new
// guard), Cecep leaves, and everyone moves to a new 5-day rotation
// (Pagi/Pagi/Malam/Malam/OFF instead of OFF/Pagi/OFF/Malam/Malam).
//
// Clean slate: every existing shift row (the old Sep roster, the old
// October, and November auto-generated from the old pattern) is deleted
// first, then only October from the PDF is inserted. November onward can
// be generated again from /security, continuing the new rotation. Only
// security_shifts — check-ins and patrol reports are left as they are.
//
// Run from the project root:
//   node --env-file=.env.local scripts/import-security-oktober-2026.mjs           (dry run — prints the plan, changes nothing)
//   node --env-file=.env.local scripts/import-security-oktober-2026.mjs --apply   (actually performs the changes)
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
// .env.local (same as src/lib/supabase/admin.ts).

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const MONTH_START = "2026-10-01";
const MONTH_END = "2026-10-31";
const NOTE = "Input dari Jadwal_Security_Oktober2026.pdf";
const RECORDED_BY = "18g@kiwari.local";

// Transcribed from the PDF, days 1..31. P = pagi, M = malam, O = off.
const ROSTER = {
  Dedi: { phone: "082318380554", days: "PPMMOPPMMOPPMMOPPMMOPPMMOPPMMOP" },
  Didin: { phone: "087835762952", days: "PMMOPPMMOPPMMOPPMMOPPMMOPPMMOPP" },
  Nova: { phone: "085721285928", days: "MOPPMMOPPMMOPPMMOPPMMOPPMMOPPMM" },
  Ayi: { phone: "088218302853", days: "MMOPPMMOPPMMOPPMMOPPMMOPPMMOPPM" },
  Septi: { phone: "082127893199", days: "OPPMMOPPMMOPPMMOPPMMOPPMMOPPMMO" },
};

const SHIFT = { P: "pagi", M: "malam", O: "off" };

// Sanity checks on the transcription before touching anything: 31 days
// each, and every day has 2 Pagi + 2 Malam + 1 OFF like the PDF shows.
for (const [name, { days }] of Object.entries(ROSTER)) {
  if (days.length !== 31) throw new Error(`${name}: ${days.length} hari, harusnya 31`);
}
for (let d = 0; d < 31; d++) {
  const col = Object.values(ROSTER).map((r) => r.days[d]).sort().join("");
  if (col !== "MMOPP") throw new Error(`Tgl ${d + 1}: komposisi ${col}, harusnya 2P 2M 1OFF`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const { data: guards, error: guardsError } = await supabase
  .from("security_guards")
  .select("id, name, phone, is_active");
if (guardsError) throw guardsError;

console.log("Guard sekarang:");
for (const g of guards) {
  console.log(`  ${g.name} (${g.phone ?? "-"}) ${g.is_active ? "aktif" : "nonaktif"}`);
}

const byName = new Map(guards.map((g) => [g.name.trim().toLowerCase(), g]));
const rosterNames = new Set(Object.keys(ROSTER).map((n) => n.toLowerCase()));

const { data: octShifts } = await supabase
  .from("security_shifts")
  .select("guard_id, shift_date, shift_type")
  .gte("shift_date", MONTH_START)
  .lte("shift_date", MONTH_END);
const { count: totalShifts } = await supabase
  .from("security_shifts")
  .select("id", { count: "exact", head: true });
const { count: earlierCheckins } = await supabase
  .from("security_checkins")
  .select("id", { count: "exact", head: true })
  .lt("shift_date", MONTH_START);
const { count: earlierPatrols } = await supabase
  .from("security_patrols")
  .select("id", { count: "exact", head: true })
  .lt("shift_date", MONTH_START);
const { data: octCheckins } = await supabase
  .from("security_checkins")
  .select("guard_id, shift_date, shift_type, status")
  .gte("shift_date", MONTH_START)
  .lte("shift_date", MONTH_END);

console.log(`\nShift Oktober tersimpan: ${octShifts?.length ?? 0} baris`);
console.log(`Total shift tersimpan (semua bulan): ${totalShifts ?? 0} baris`);
console.log(
  `Absen / patroli sebelum Oktober (tidak dihapus): ${earlierCheckins ?? 0} / ${earlierPatrols ?? 0}`
);
console.log(`Absen Oktober: ${octCheckins?.length ?? 0}`);
const guardName = (id) => guards.find((g) => g.id === id)?.name ?? id;
for (const c of octCheckins ?? []) {
  const roster = ROSTER[Object.keys(ROSTER).find((n) => n.toLowerCase() === guardName(c.guard_id).toLowerCase())];
  const newType = roster ? SHIFT[roster.days[Number(c.shift_date.slice(8)) - 1]] : "(tidak di jadwal baru)";
  console.log(
    `  ${guardName(c.guard_id)} ${c.shift_date} ${c.shift_type} [${c.status}] -> jadwal baru: ${newType}${newType === c.shift_type ? "" : "  ⚠ beda"}`
  );
}

console.log("\nRencana:");
const toDeactivate = guards.filter(
  (g) => g.is_active && !rosterNames.has(g.name.trim().toLowerCase())
);
for (const g of toDeactivate) {
  console.log(`  Nonaktifkan ${g.name}`);
}
for (const [name, { phone }] of Object.entries(ROSTER)) {
  const g = byName.get(name.toLowerCase());
  if (!g) console.log(`  Tambah guard baru ${name} (${phone})`);
  else if (g.phone !== phone || !g.is_active)
    console.log(`  Update ${name}: no. HP ${g.phone ?? "-"} -> ${phone}${g.is_active ? "" : ", aktifkan"}`);
}
console.log(`  Hapus semua ${totalShifts ?? 0} shift lama (semua bulan)`);
console.log(`  Masukkan ${Object.keys(ROSTER).length * 31} shift Oktober dari PDF (5 guard x 31 hari)`);

if (!APPLY) {
  console.log("\nDry run — tidak ada yang diubah. Jalankan dengan --apply untuk menerapkan.");
  process.exit(0);
}

for (const g of toDeactivate) {
  const { error } = await supabase
    .from("security_guards")
    .update({ is_active: false })
    .eq("id", g.id);
  if (error) throw error;
}

// Supabase refuses a delete with no filter at all — every real row has
// a non-null id, so this matches the whole table.
const { error: deleteError } = await supabase
  .from("security_shifts")
  .delete()
  .not("id", "is", null);
if (deleteError) throw deleteError;

const rows = [];
for (const [name, { phone, days }] of Object.entries(ROSTER)) {
  let g = byName.get(name.toLowerCase());
  if (!g) {
    const { data, error } = await supabase
      .from("security_guards")
      .insert({ name, phone })
      .select("id, name, phone, is_active")
      .single();
    if (error) throw error;
    g = data;
  } else if (g.phone !== phone || !g.is_active) {
    const { error } = await supabase
      .from("security_guards")
      .update({ phone, is_active: true })
      .eq("id", g.id);
    if (error) throw error;
  }
  [...days].forEach((code, i) => {
    rows.push({
      guard_id: g.id,
      shift_date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      shift_type: SHIFT[code],
      note: NOTE,
      recorded_by: RECORDED_BY,
    });
  });
}

const { error: insertError } = await supabase.from("security_shifts").insert(rows);
if (insertError) throw insertError;

await supabase.from("activity_log").insert({
  actor_email: RECORDED_BY,
  action: "security.import_schedule",
  detail: `2026-10 - ${rows.length} shift dari Jadwal_Security_Oktober2026.pdf (Septi masuk, ${toDeactivate.map((g) => g.name).join(", ") || "-"} nonaktif), ${totalShifts ?? 0} shift lama dihapus`,
});

console.log(`\nSelesai: ${rows.length} shift Oktober ditulis.`);
