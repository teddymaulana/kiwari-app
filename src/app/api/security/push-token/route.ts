import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// The Android security app registers its Expo push token here on every
// start, so Alert Sekuriti can reach it while closed (lib/securityPush.ts).
// Gated on SECURITY_APP_KEY like the rest of /api/security/*.
export async function POST(request: NextRequest) {
  const appKey = process.env.SECURITY_APP_KEY;
  if (!appKey || request.headers.get("x-app-key") !== appKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
    device_name?: unknown;
  } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) {
    return NextResponse.json({ error: "Token tidak valid" }, { status: 400 });
  }
  const device_name =
    typeof body?.device_name === "string" ? body.device_name.slice(0, 100) : null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("security_push_tokens")
    .upsert(
      { token, device_name, last_seen_at: new Date().toISOString() },
      { onConflict: "token" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
