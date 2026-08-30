// Builds an SMS "click to send" link (sms: URI) that pre-fills a message
// in the device's own SMS app — no gateway involved, nothing sent until
// the person taps Send themselves. Same admin-attended-send pattern as
// waMe.ts's buildWaMeUrl, offered as a fallback for numbers that can't be
// reached over WhatsApp.
export function buildSmsUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  const international = digits.startsWith("62") ? `+${digits}` : `+62${digits.replace(/^0/, "")}`;
  return `sms:${international}?body=${encodeURIComponent(message)}`;
}
