// Fonnte WhatsApp gateway (fonnte.com) — one-way, system-to-warga messages
// only. Server-side only: FONNTE_TOKEN must never reach the client.
// API reference: https://docs.fonnte.com/api-send-message/

export type FonnteResult =
  | { success: true }
  | { success: false; reason: string };

export async function sendWhatsAppMessage(
  target: string,
  message: string
): Promise<FonnteResult> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    return { success: false, reason: "FONNTE_TOKEN belum diatur" };
  }

  const response = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ target, message }),
  });

  const data = await response.json();

  if (!response.ok || data.status === false) {
    return {
      success: false,
      reason: data.reason || `HTTP ${response.status}`,
    };
  }

  return { success: true };
}
