"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, WHATSAPP_TEST_SENDERS } from "@/lib/auth";
import { getWhatsAppProvider, sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendViaWablas, WARGA_GROUP_ID } from "@/lib/wablas";

// Manual WhatsApp send, for testing the Fonnte integration before it's
// wired into automatic events (e.g. payment confirmed). Moved here from
// settings/actions.ts when Kirim Pesan WhatsApp got its own Humas menu.
export async function sendTestWhatsApp(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");
  if (!WHATSAPP_TEST_SENDERS.includes(user.email)) redirect("/humas");

  const toGroup = formData.get("target") === "group";
  const phone = toGroup
    ? WARGA_GROUP_ID
    : String(formData.get("phone") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!phone || !message) {
    redirect(
      "/humas?wa_error=" +
        encodeURIComponent("No. HP dan pesan wajib diisi")
    );
  }

  const provider = await getWhatsAppProvider();

  // Group sends go straight to Wablas (the only gateway wired for group
  // JIDs), still honoring the "off" toggle like sendWeeklyReport does.
  let result;
  if (toGroup) {
    result =
      provider === "off"
        ? {
            success: false as const,
            reason: "Layanan WhatsApp sedang dimatikan",
            detail: "",
          }
        : await sendViaWablas(phone, message, true);
  } else {
    result = await sendWhatsAppMessage(phone, message);
  }

  const supabase = await createClient();
  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: result.success ? "whatsapp.send" : "whatsapp.send_failed",
    detail: result.success
      ? `${phone} - ${message} - ${result.detail}`
      : `${phone} - ${result.reason} - ${result.detail}`,
  });

  // Only logged into the Percakapan thread (wa_messages) when it actually
  // went out via Wablas — a Fonnte send can never get a reply captured
  // back (different account/number), so it'd just be a dead-end "out" row.
  const wentViaWablas = toGroup ? provider !== "off" : provider === "wablas";
  if (result.success && wentViaWablas) {
    await supabase.from("wa_messages").insert({
      direction: "out",
      phone,
      is_group: toGroup,
      message,
      sent_by: user.email,
      // Lets the Wablas tracking webhook (api/webhooks/wablas-tracking)
      // find this row later and fill in real delivery status — null when
      // the send response didn't parse the way sendViaWablas expects, in
      // which case status just stays on the generic "Terkirim" fallback.
      wablas_message_id: result.messageId ?? null,
    });
  }

  if (!result.success) {
    redirect(`/humas?wa_error=${encodeURIComponent(result.reason)}`);
  }

  redirect("/humas?wa_success=1");
}
