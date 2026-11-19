import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Alert Sekuriti for the Android security app (mobile/), which polls this
// every few seconds while open: alerts from the last day that no pengurus
// has closed yet, newest first. "open" ones make the phone vibrate and
// show full-screen until a guard taps "Saya Tangani" (./[id]/ack).
// Gated on SECURITY_APP_KEY like /api/security/sync, failing closed.
const WINDOW_HOURS = 24;
// The app shows the photo straight away; it refetches long before this.
const PHOTO_URL_TTL_SECONDS = 60 * 60;

export async function GET(request: NextRequest) {
  const appKey = process.env.SECURITY_APP_KEY;
  if (!appKey || request.headers.get("x-app-key") !== appKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("security_alerts")
    .select(
      "id, message, photo_path, status, created_at, acknowledged_at, households(unit_no), security_guards(name)"
    )
    .in("status", ["open", "acknowledged"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        message: string;
        photo_path: string | null;
        status: "open" | "acknowledged";
        created_at: string;
        acknowledged_at: string | null;
        households: { unit_no: string } | null;
        security_guards: { name: string } | null;
      }[]
    >();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const paths = (data ?? []).flatMap((a) => (a.photo_path ? [a.photo_path] : []));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await admin.storage
      .from("bukti-kehadiran")
      .createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  return NextResponse.json({
    alerts: (data ?? []).map((a) => ({
      id: a.id,
      message: a.message,
      unit_no: a.households?.unit_no ?? null,
      status: a.status,
      created_at: a.created_at,
      acknowledged_at: a.acknowledged_at,
      acknowledged_by: a.security_guards?.name ?? null,
      photo_url: a.photo_path ? signed.get(a.photo_path) ?? null : null,
    })),
  });
}
