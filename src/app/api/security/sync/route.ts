import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Offline data for the Android security app (mobile/): active guards with
// their PINs, plus their shifts from yesterday through a week ahead and
// the absen/patroli already on file for those shifts (so the app shows
// "Sudah absen" instead of the button, even on a different phone). The
// app caches this so a guard can log in and pick a shift with no signal;
// submissions are still PIN-checked again server-side when they arrive.
// Because this hands out PINs, it's gated on SECURITY_APP_KEY (baked into
// the app build as EXPO_PUBLIC_APP_KEY) and fails closed when unset —
// same pattern as the cron/webhook secrets.
export async function GET(request: NextRequest) {
  const appKey = process.env.SECURITY_APP_KEY;
  if (!appKey || request.headers.get("x-app-key") !== appKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const from = new Date();
  from.setDate(from.getDate() - 1);
  const to = new Date();
  to.setDate(to.getDate() + 7);

  const admin = createAdminClient();
  const range = { from: toDateStr(from), to: toDateStr(to) };
  const [guardsRes, shiftsRes, checkinsRes, patrolsRes] = await Promise.all([
    admin
      .from("security_guards")
      .select("id, name, pin")
      .eq("is_active", true)
      .not("pin", "is", null)
      .order("name"),
    admin
      .from("security_shifts")
      .select("guard_id, shift_date, shift_type")
      .gte("shift_date", range.from)
      .lte("shift_date", range.to)
      .in("shift_type", ["pagi", "malam"]),
    admin
      .from("security_checkins")
      .select("guard_id, shift_date, shift_type, status, checked_in_at, captured_at")
      .gte("shift_date", range.from)
      .lte("shift_date", range.to),
    admin
      .from("security_patrols")
      .select("guard_id, shift_date, shift_type, submitted_at, captured_at")
      .gte("shift_date", range.from)
      .lte("shift_date", range.to),
  ]);
  const error = guardsRes.error ?? shiftsRes.error ?? checkinsRes.error ?? patrolsRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // at: when the guard took the photo / pressed Kirim, falling back to
  // arrival for web submissions (no captured_at).
  const done = [
    ...(checkinsRes.data ?? []).map((c) => ({
      kind: "checkin",
      guard_id: c.guard_id,
      shift_date: c.shift_date,
      shift_type: c.shift_type,
      at: c.captured_at ?? c.checked_in_at,
      rejected: c.status === "rejected",
    })),
    ...(patrolsRes.data ?? []).map((p) => ({
      kind: "patroli",
      guard_id: p.guard_id,
      shift_date: p.shift_date,
      shift_type: p.shift_type,
      at: p.captured_at ?? p.submitted_at,
      rejected: false,
    })),
  ];

  return NextResponse.json({
    guards: guardsRes.data ?? [],
    shifts: shiftsRes.data ?? [],
    done,
  });
}
