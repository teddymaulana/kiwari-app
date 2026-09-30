import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { iplFirstMonth } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";

// Public: backs the unauthenticated "Bayar IPL" form on /login, where the
// household is only known client-side once picked (or OCR-matched). Any
// existing payment row — pending or confirmed — blocks that period via the
// unique constraint, so both statuses count as "paid" here.
export async function GET(request: NextRequest) {
  const householdId = request.nextUrl.searchParams.get("household_id");
  const year = Number(request.nextUrl.searchParams.get("year"));
  const allMonths = request.nextUrl.searchParams.get("all_months") === "1";

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
  // Catat Pembayaran (pengurus) passes all_months=1 to also get the months
  // before iplFirstMonth — e.g. Jan–Jul 2026 dues collected outside the
  // app that still need recording. Honored only for a pengurus, so the
  // public Bayar IPL form keeps its Agustus 2026 start.
  const firstMonth =
    allMonths && (await getCurrentUser())?.role === "pengurus"
      ? 1
      : iplFirstMonth(year);
  const unpaidMonths = Array.from(
    { length: 12 - firstMonth + 1 },
    (_, i) => i + firstMonth
  ).filter((m) => !settled.has(m));

  return NextResponse.json({ unpaidMonths });
}
