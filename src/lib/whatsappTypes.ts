// Shared between the provider implementations (fonnte.ts, wablas.ts) and
// the dispatcher (whatsapp.ts) — kept in its own file to avoid a circular
// import (the dispatcher imports the provider send functions).
export type WhatsAppResult =
  // `detail` is the provider's raw response body (stringified) — the
  // top-level `status`/`reason` fields don't capture everything a gateway
  // reports (e.g. per-target delivery info), so callers troubleshooting a
  // "shows sent but never arrived" report should log `detail` too.
  //
  // `messageId` (Wablas only, best-effort parsed from the send response)
  // lets a caller correlate this send with a later status update from
  // Wablas's tracking webhook (see wa_messages.wablas_message_id) — left
  // undefined for Fonnte, and possibly undefined for Wablas too if its
  // response shape doesn't match the guessed field names.
  | { success: true; detail: string; messageId?: string }
  | { success: false; reason: string; detail: string };
