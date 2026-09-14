import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { iplFirstMonth } from "@/lib/types";

// Public: backs the unauthenticated "Bayar IPL" form on /login, where the
// household is only known client-side once picked (or OCR-matched). Any
// existing payment row — pending or confirmed — blocks that period via the
// unique constraint, so both statuses count as "paid" here.
export async function GET(request: NextRequest) {
  const householdId = request.nextUrl.searchParams.get("household_id");
  const year = Number(request.nextUrl.searchParams.get("year"));

  if (!householdId || !year) {
    return NextResponse.json(
      { error: "household_id dan year wajib diisi" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const [{ data: payments }, { data: exemptions }] = await Promise.all([
    admin
      .from("payments")
      .select("period_month")
      .eq("household_id", householdId)
      .eq("period_year", year),
    admin
      .from("ipl_exemptions")
      .select("period_month")
      .eq("household_id", householdId)
      .eq("period_year", year),
  ]);

  // A month with an IPL exemption (see schema.sql) isn't owed at all, so it
  // never counts as "unpaid" — same treatment as an already-paid month.
  const settled = new Set([
    ...(payments ?? []).map((p) => p.period_month),
    ...(exemptions ?? []).map((e) => e.period_month),
  ]);
  const firstMonth = iplFirstMonth(year);
  const unpaidMonths = Array.from(
    { length: 12 - firstMonth + 1 },
    (_, i) => i + firstMonth
  ).filter((m) => !settled.has(m));

  return NextResponse.json({ unpaidMonths });
}
