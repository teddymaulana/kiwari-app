import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Offline data for the Android security app (mobile/): active guards with
// their PINs, plus their shifts from yesterday through a week ahead. The
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
  const [{ data: guards, error: guardsError }, { data: shifts, error: shiftsError }] =
    await Promise.all([
      admin
        .from("security_guards")
        .select("id, name, pin")
        .eq("is_active", true)
        .not("pin", "is", null)
        .order("name"),
      admin
        .from("security_shifts")
        .select("guard_id, shift_date, shift_type")
        .gte("shift_date", toDateStr(from))
        .lte("shift_date", toDateStr(to))
        .in("shift_type", ["pagi", "malam"]),
    ]);
  const error = guardsError ?? shiftsError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ guards: guards ?? [], shifts: shifts ?? [] });
}
