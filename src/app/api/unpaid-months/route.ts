import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const { data } = await admin
    .from("payments")
    .select("period_month")
    .eq("household_id", householdId)
    .eq("period_year", year);

  const paid = new Set((data ?? []).map((p) => p.period_month));
  const unpaidMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(
    (m) => !paid.has(m)
  );

  return NextResponse.json({ unpaidMonths });
}
