// Wablas WhatsApp gateway (wablas.com) — second provider behind the
// toggle in src/lib/whatsapp.ts, alongside Fonnte (fonnte.ts). Server-side
// only: WABLAS_TOKEN/WABLAS_SECRET_KEY must never reach the client.
//
// Unlike Fonnte (one fixed api.fonnte.com endpoint), Wablas assigns each
// account its own server subdomain (shown on your Wablas dashboard, e.g.
// https://sby.wablas.com) — set that as WABLAS_BASE_URL. Field names below
// (phone/message, status/message) are Wablas's documented send-message
// shape as of this writing; if your dashboard's API docs show different
// field names, this is the one place to adjust them — `detail` below
// always carries the raw response either way, so a shape mismatch shows
// up in activity_log rather than failing silently.
//
// Wablas rejects requests from an unrecognized IP unless the Authorization
// header is "{token}.{secretKey}" instead of just the token — the secret
// key is a separate value on the same dashboard page as the token. Set
// WABLAS_SECRET_KEY to avoid depending on a stable server IP.

import type { WhatsAppResult } from "./whatsappTypes";

// Without this, an unresponsive Wablas server (connection accepted, no
// reply) leaves the request pending forever — fetch has no default
// timeout — which is exactly what makes "Kirim Info Login" look stuck on
// "Mengirim..." indefinitely instead of eventually failing with a reason.
const TIMEOUT_MS = 20_000;

export async function sendViaWablas(
  target: string,
  message: string
): Promise<WhatsAppResult> {
  const token = process.env.WABLAS_TOKEN;
  const secretKey = process.env.WABLAS_SECRET_KEY;
  const baseUrl = process.env.WABLAS_BASE_URL;

  if (!token || !baseUrl) {
    return {
      success: false,
      reason: "WABLAS_TOKEN atau WABLAS_BASE_URL belum diatur",
      detail: "",
    };
  }

  const authorization = secretKey ? `${token}.${secretKey}` : token;

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/send-message`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone: target, message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      success: false,
      reason: timedOut
        ? `Wablas tidak merespons dalam ${TIMEOUT_MS / 1000} detik`
        : `Gagal terhubung ke Wablas: ${err instanceof Error ? err.message : String(err)}`,
      detail: "",
    };
  }

  const rawBody = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(rawBody);
  } catch {
    // Non-JSON body (e.g. an HTML error page) — fall through with
    // data.status/message left undefined, rawBody still gets logged below.
  }

  if (!response.ok || data.status === false) {
    return {
      success: false,
      reason:
        (data.message as string) || (data.reason as string) || `HTTP ${response.status}`,
      detail: rawBody,
    };
  }

  return { success: true, detail: rawBody };
}
