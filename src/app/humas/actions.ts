"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getWhatsAppProvider, sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendBulkViaWablas, sendViaWablas, WARGA_GROUP_ID } from "@/lib/wablas";
import { sendViaFonnte } from "@/lib/fonnte";

// Appended to every Kirim Pesan WhatsApp send so recipients know the
// message came through Kiwari. Underscores render as italics in WhatsApp.
const MESSAGE_FOOTER = "──────────\n_Pesan otomatis dari Kiwari App_";

// Manual WhatsApp send, for testing the Fonnte integration before it's
// wired into automatic events (e.g. payment confirmed). Moved here from
// settings/actions.ts when Kirim Pesan WhatsApp got its own Humas menu.
export async function sendTestWhatsApp(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  if (String(formData.get("target") || "").startsWith("kk:")) {
    return blastToKepalaKeluarga(user.email, formData);
  }

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
  const fullMessage = `${message}\n\n${MESSAGE_FOOTER}`;

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
        : await sendViaWablas(phone, fullMessage, true);
  } else {
    result = await sendWhatsAppMessage(phone, fullMessage);
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
      message: fullMessage,
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

// Kepala keluarga blast targets ("kk:all", "kk:pengurus", "kk:blok:<n>" —
// the group only shapes the list on the form): one message to each
// recipient the form left in the list, submitted as "<household id>:kk"
// (households.phone) or "<household id>:pasangan" (phone_pasangan, from
// the Tambah penerima picker) — ones removed with ✕ are simply absent.
// Numbers are looked up here rather than trusted from the form, re-checked
// as active, and deduped. Sent as a single bulk request to whichever
// gateway is active — a per-recipient loop of sendWhatsAppMessage would
// blow past maxDuration on humas/page.tsx.
async function blastToKepalaKeluarga(actorEmail: string, formData: FormData) {
  const message = String(formData.get("message") || "").trim();
  if (!message) {
    redirect("/humas?wa_error=" + encodeURIComponent("Pesan wajib diisi"));
  }

  const recipientKeys = formData.getAll("recipient").map(String);
  const householdIds = [
    ...new Set(recipientKeys.map((key) => key.split(":")[0]).filter(Boolean)),
  ];
  if (householdIds.length === 0) {
    redirect(
      "/humas?wa_error=" + encodeURIComponent("Pilih minimal satu penerima")
    );
  }

  const supabase = await createClient();
  const { data: households } = await supabase
    .from("households")
    .select("id, phone, phone_pasangan")
    .in("id", householdIds)
    .eq("is_active", true)
    .returns<
      { id: string; phone: string | null; phone_pasangan: string | null }[]
    >();

  const byId = new Map((households ?? []).map((h) => [h.id, h]));
  const phones = [
    ...new Set(
      recipientKeys
        .map((key) => {
          const [id, kind] = key.split(":");
          const h = byId.get(id);
          return kind === "pasangan" ? h?.phone_pasangan : h?.phone;
        })
        .map((p) => p?.trim())
        .filter((p): p is string => !!p)
    ),
  ];
  if (phones.length === 0) {
    redirect(
      "/humas?wa_error=" +
        encodeURIComponent("Tidak ada penerima dengan No. HP terdaftar")
    );
  }

  const provider = await getWhatsAppProvider();
  const fullMessage = `${message}\n\n${MESSAGE_FOOTER}`;

  let result:
    | { success: true; detail: string; messageIds?: (string | undefined)[] }
    | { success: false; reason: string; detail: string };
  if (provider === "wablas") {
    result = await sendBulkViaWablas(
      phones.map((phone) => ({ phone, message: fullMessage }))
    );
  } else if (provider === "fonnte") {
    result = await sendViaFonnte(phones.join(","), fullMessage, "2-5");
  } else {
    result = {
      success: false,
      reason:
        provider === "off"
          ? "Layanan WhatsApp sedang dimatikan"
          : "Kirim ke banyak nomor sekaligus butuh gateway Fonnte atau Wablas — Layanan WhatsApp sedang diatur ke Manual",
      detail: "",
    };
  }

  const group = String(formData.get("target"));
  await supabase.from("activity_log").insert({
    actor_email: actorEmail,
    action: result.success ? "whatsapp.blast" : "whatsapp.blast_failed",
    detail: result.success
      ? `${phones.length} nomor (${group}) - ${message} - ${result.detail}`
      : `${phones.length} nomor (${group}) - ${result.reason} - ${result.detail}`,
  });

  // Same rule as sendTestWhatsApp: only Wablas sends go into the
  // Percakapan thread, one row per recipient.
  if (result.success && provider === "wablas") {
    const messageIds = "messageIds" in result ? result.messageIds : undefined;
    await supabase.from("wa_messages").insert(
      phones.map((phone, i) => ({
        direction: "out",
        phone,
        is_group: false,
        message: fullMessage,
        sent_by: actorEmail,
        wablas_message_id: messageIds?.[i] ?? null,
      }))
    );
  }

  if (!result.success) {
    redirect(`/humas?wa_error=${encodeURIComponent(result.reason)}`);
  }

  redirect(`/humas?wa_blast=${phones.length}`);
}
