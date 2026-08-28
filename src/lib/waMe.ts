// Builds a WhatsApp "click to chat" link (wa.me) that pre-fills a message
// in the user's own logged-in WhatsApp Web/Desktop — no gateway involved,
// nothing sent until the person clicks Send themselves. Used for
// admin-attended sends (Kirim Info Login, payment confirmation) where a
// pengurus is at their computer clicking a button, as opposed to the
// Fonnte/Wablas gateway in src/lib/whatsapp.ts, which is reserved for
// sends that must fire without anyone present (e.g. notifying 18G when a
// warga submits a claim).
export function buildWaMeUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  const international = digits.startsWith("62") ? digits : `62${digits.replace(/^0/, "")}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}
