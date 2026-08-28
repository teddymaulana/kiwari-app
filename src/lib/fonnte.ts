// Fonnte WhatsApp gateway (fonnte.com) — one-way, system-to-warga messages
// only. Server-side only: FONNTE_TOKEN must never reach the client.
// API reference: https://docs.fonnte.com/api-send-message/

export type FonnteResult =
  // `detail` is Fonnte's raw response body (stringified) — the top-level
  // `status`/`reason` fields this module keys off don't capture everything
  // Fonnte reports (e.g. per-target delivery info), so callers that want
  // to troubleshoot a "shows sent but never arrived" report should log
  // `detail` too rather than just success/failure.
  | { success: true; detail: string }
  | { success: false; reason: string; detail: string };

export async function sendWhatsAppMessage(
  target: string,
  message: string
): Promise<FonnteResult> {
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    return {
      success: false,
      reason: "FONNTE_TOKEN belum diatur",
      detail: "",
    };
  }

  const response = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ target, message }),
  });

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
