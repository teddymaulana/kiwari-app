import { NextRequest, NextResponse } from "next/server";
import { sendWeeklyReport } from "@/lib/weeklyReport";

// Triggered by Vercel Cron every Sunday (see vercel.json). Vercel adds
// "Authorization: Bearer $CRON_SECRET" to its own cron requests when
// CRON_SECRET is set on the project — this endpoint rejects anything
// else, including a missing CRON_SECRET (fail closed).
//
// The actual message/recipient/send logic lives in src/lib/weeklyReport.ts
// so it's identical to the manual "Kirim Laporan Mingguan" button on
// /settings (restricted to WEEKLY_REPORT_SENDERS).
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendWeeklyReport(null);

  if (!result.success && result.skipped) {
    return NextResponse.json({ skipped: result.reason });
  }

  return NextResponse.json(
    result.success ? { success: true } : { success: false, error: result.reason }
  );
}
