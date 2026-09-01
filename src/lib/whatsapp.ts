// Reads settings.whatsapp_provider (see Pengaturan > Layanan WhatsApp) —
// four options:
//   - "fonnte" / "wablas": server-to-server gateway sends, no one needs to
//     be present. Call sites that must fire unattended (e.g. notifying
//     18G when a warga submits a claim) should use these directly.
//   - "manual": no gateway at all — a pengurus opens a wa.me link
//     (src/lib/waMe.ts) from their own browser and hits Send themselves.
//     This can't happen from server-only code, so pages that support it
//     branch on getWhatsAppProvider() and render a different client
//     component for that case (see households/page.tsx,
//     payments/new/page.tsx) instead of calling sendWhatsAppMessage.
//   - "off": WhatsApp sending is turned off entirely, everywhere —
//     including the unattended claim-notify path in paymentClaim.ts,
//     which otherwise bypasses this toggle. Every automatic send becomes
//     a clean, expected failure instead of firing.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendViaFonnte } from "./fonnte";
import { sendViaWablas } from "./wablas";
import type { WhatsAppResult } from "./whatsappTypes";

export type { WhatsAppResult } from "./whatsappTypes";
export type WhatsAppProvider = "fonnte" | "wablas" | "manual" | "off";

export async function getWhatsAppProvider(): Promise<WhatsAppProvider> {
  // Admin client, not the cookie-bound one: this also fires from the
  // public unauthenticated "Bayar IPL" claim flow (paymentClaim.ts), which
  // has no session for RLS's "authenticated read settings" policy to pass.
  const admin = createAdminClient();
  const { data } = await admin
    .from("settings")
    .select("whatsapp_provider")
    .eq("id", 1)
    .single<{ whatsapp_provider: WhatsAppProvider | null }>();

  return data?.whatsapp_provider ?? "fonnte";
}

// For call sites that need an unattended server-to-server send. Returns a
// clear failure if the provider is currently set to "manual" (no gateway
// to send through) or "off" (WhatsApp sending is turned off entirely).
export async function sendWhatsAppMessage(
  target: string,
  message: string
): Promise<WhatsAppResult> {
  const provider = await getWhatsAppProvider();

  if (provider === "off") {
    return {
      success: false,
      reason: "Layanan WhatsApp sedang dimatikan",
      detail: "",
    };
  }

  if (provider === "manual") {
    return {
      success: false,
      reason:
        "Layanan WhatsApp sedang diatur ke Manual — kirim langsung dari halaman terkait, bukan otomatis.",
      detail: "",
    };
  }

  return provider === "wablas"
    ? sendViaWablas(target, message)
    : sendViaFonnte(target, message);
}
