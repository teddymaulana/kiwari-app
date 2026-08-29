// Fonnte WhatsApp gateway (fonnte.com) — one-way, system-to-warga messages
// only. Server-side only: FONNTE_TOKEN must never reach the client.
// API reference: https://docs.fonnte.com/api-send-message/
//
// One of two providers behind the toggle in src/lib/whatsapp.ts (the other
// is wablas.ts) — call sites should import sendWhatsAppMessage from there,
// not this file directly, so the settings.whatsapp_provider toggle is
// respected.

import type { WhatsAppResult } from "./whatsappTypes";

// Without this, an unresponsive Fonnte server (connection accepted, no
// reply) leaves the request pending forever — fetch has no default
// timeout — which is exactly what makes "Kirim Info Login" look stuck on
// "Mengirim..." indefinitely instead of eventually failing with a reason.
const TIMEOUT_MS = 20_000;

export async function sendViaFonnte(
  target: string,
  message: string
): Promise<WhatsAppResult> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    return {
      success: false,
      reason: "FONNTE_TOKEN belum diatur",
      detail: "",
    };
  }

  let response: Response;
  try {
    response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target, message }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      success: false,
      reason: timedOut
        ? `Fonnte tidak merespons dalam ${TIMEOUT_MS / 1000} detik`
        : `Gagal terhubung ke Fonnte: ${err instanceof Error ? err.message : String(err)}`,
      detail: "",
    };
  }

  const rawBody = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(rawBody);
  } catch {
    // Non-JSON body (e.g. an HTML error page) — fall through with
    // data.status/reason left undefined, rawBody still gets logged below.
  }

  if (!response.ok || data.status === false) {
    return {
      success: false,
      reason: (data.reason as string) || `HTTP ${response.status}`,
      detail: rawBody,
    };
  }

  return { success: true, detail: rawBody };
}
