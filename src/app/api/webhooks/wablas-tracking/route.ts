import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Receives Wablas's message-status ("tracking") webhook — separate from
// the incoming-message one at api/webhooks/wablas/route.ts. Wablas fires
// this as a message we sent moves through pending -> sent -> delivered ->
// read (or reject/cancel on failure), letting the Percakapan panel on
// /humas show real delivery status instead of just "Terkirim" the moment
// the send API call returned success.
//
// Configured separately from the incoming-message webhook: on the Wablas
// dashboard look for a device-level "Tracking URL" field, or call their
// API directly — POST {WABLAS_BASE_URL}/api/device/change-tracking-url
// with your token/secret and tracking_url set to this route's URL, with
// ?token=<WABLAS_WEBHOOK_SECRET> appended (same shared secret and
// fail-closed check as the incoming-message webhook).
//
// Wablas's docs don't give a precise field-by-field shape for this
// payload either — the extraction below is a best-effort guess. A miss
// just means the matching wa_messages row keeps showing the generic
// "Terkirim" fallback instead of a real status; nothing else breaks.
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.WABLAS_WEBHOOK_SECRET;
  const token = request.nextUrl.searchParams.get("token");
  if (!webhookSecret || token !== webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = typeof body.id === "string" ? body.id : null;
  const status = typeof body.status === "string" ? body.status : null;

  if (!messageId || !status) {
    // Nothing usable to match against — still 200 so Wablas doesn't retry
    // forever, but skip the update.
    return NextResponse.json({ success: true, matched: false });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("wa_messages")
    .update({ status })
    .eq("wablas_message_id", messageId)
    .select("id");

  return NextResponse.json({ success: true, matched: (data?.length ?? 0) > 0 });
}
