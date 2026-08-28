// Shared between the provider implementations (fonnte.ts, wablas.ts) and
// the dispatcher (whatsapp.ts) — kept in its own file to avoid a circular
// import (the dispatcher imports the provider send functions).
export type WhatsAppResult =
  // `detail` is the provider's raw response body (stringified) — the
  // top-level `status`/`reason` fields don't capture everything a gateway
  // reports (e.g. per-target delivery info), so callers troubleshooting a
  // "shows sent but never arrived" report should log `detail` too.
  | { success: true; detail: string }
  | { success: false; reason: string; detail: string };
