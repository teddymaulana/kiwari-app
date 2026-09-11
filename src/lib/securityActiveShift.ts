import { createAdminClient } from "@/lib/supabase/admin";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Candidate shifts a guard might currently be checking in / reporting
// for — today's Pagi or Malam, plus yesterday's Malam (an overnight
// shift is still "active" through the early morning). Used by the public
// /security/checkin and /security/patroli pages, both unauthenticated,
// so this always goes through the admin client. Deliberately doesn't try
// to guess a single "correct" shift by time-of-day — the guard picks
// from whichever candidates exist, which sidesteps timezone/cutoff edge
// cases around the shift boundary.
export async function getActiveShiftCandidates(
  guardId: string
): Promise<{ shift_date: string; shift_type: "pagi" | "malam" }[]> {
  const admin = createAdminClient();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const { data } = await admin
    .from("security_shifts")
    .select("shift_date, shift_type")
    .eq("guard_id", guardId)
    .in("shift_date", [toDateStr(today), toDateStr(yesterday)])
    .in("shift_type", ["pagi", "malam"]);

  const rows = (data ?? []) as { shift_date: string; shift_type: "pagi" | "malam" }[];
  return rows.sort((a, b) => (a.shift_date < b.shift_date ? 1 : -1));
}
