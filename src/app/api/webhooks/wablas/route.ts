import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Receives Wablas's incoming-message webhook — paste this route's full URL
// into the Wablas dashboard under Device > Setting > Webhook Receive, with
// ?token=<WABLAS_WEBHOOK_SECRET> appended. Wablas offers no way to verify
// a request really came from them beyond that shared secret in the URL,
// so this fails closed exactly like the cron webhook
// (api/cron/weekly-report/route.ts) does when the secret is unset or
// doesn't match.
//
// Wablas's public docs don't give a precise field-by-field shape for this
// webhook's payload, so the extraction below is a best-effort guess
// across a few plausible field names. `raw` always keeps the entire body
// regardless, so a wrong guess here is fixable later by reparsing `raw`
// (visible on /humas) instead of having silently dropped the message.
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

  const phoneField = body.phone;
  const phone =
    typeof phoneField === "string"
      ? phoneField
      : phoneField && typeof phoneField === "object"
        ? String((phoneField as Record<string, unknown>).from ?? "")
        : String(body.from ?? body.sender ?? "");

  const message = String(body.message ?? body.text ?? body.caption ?? "");
  const isGroup = Boolean(body.isGroup ?? body.is_group ?? body.fromGroup);
  const messageType = String(body.category ?? body.type ?? "text");
  const wablasMessageId = typeof body.id === "string" ? body.id : null;

  const admin = createAdminClient();
  await admin.from("wa_messages").insert({
    direction: "in",
    phone: phone || "unknown",
    is_group: isGroup,
    message: message || null,
    message_type: messageType,
    wablas_message_id: wablasMessageId,
    raw: body,
  });

  // Wablas just needs a 2xx to consider the webhook delivered.
  return NextResponse.json({ success: true });
}
