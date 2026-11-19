import { createAdminClient } from "@/lib/supabase/admin";

// Pushes an Alert Sekuriti to every phone running the Android security app
// (tokens from /api/security/push-token), through Expo's push service,
// which hands it to Firebase Cloud Messaging. Best-effort: the alert is
// already saved, and an open app also picks it up by polling, so failures
// here are logged rather than shown to the sender.
//
// channelId must match the channel the app creates (ALERT_CHANNEL in
// mobile/src/push.ts) — that's what makes it loud, buzz and show on the
// lock screen. If "Enhanced security for push notifications" is turned on
// for the Expo project, set EXPO_ACCESS_TOKEN.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ALERT_CHANNEL = "security-alerts";
// Expo accepts at most 100 messages per request.
const BATCH = 100;

type Ticket = { status: "ok" | "error"; details?: { error?: string } };

export async function pushSecurityAlert(alert: {
  id: string;
  message: string;
  unitNo: string | null;
}) {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("security_push_tokens")
    .select("token")
    .returns<{ token: string }[]>();
  if (error) {
    console.error("pushSecurityAlert: reading tokens failed", error.message);
    return;
  }
  const tokens = (rows ?? []).map((r) => r.token);
  if (tokens.length === 0) return;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  const dead: string[] = [];
  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: alert.unitNo ? `🚨 Alert dari rumah ${alert.unitNo}` : "🚨 Alert dari warga",
            body: alert.message,
            data: { alertId: alert.id },
            channelId: ALERT_CHANNEL,
            priority: "high",
            sound: "default",
            // An alert older than 10 minutes isn't worth delivering late.
            ttl: 600,
          }))
        ),
      });
      const json = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
      if (!res.ok || !json?.data) {
        console.error("pushSecurityAlert: Expo push failed", res.status, json);
        continue;
      }
      json.data.forEach((ticket, j) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          dead.push(batch[j]);
        } else if (ticket.status === "error") {
          console.error("pushSecurityAlert: ticket error", ticket);
        }
      });
    } catch (e) {
      console.error("pushSecurityAlert: request failed", e);
    }
  }
  if (dead.length > 0) {
    await admin.from("security_push_tokens").delete().in("token", dead);
  }
}
