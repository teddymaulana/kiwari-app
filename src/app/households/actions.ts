"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  HOUSEHOLD_TOGGLERS,
  HOUSEHOLD_CREATORS,
  LOGIN_INVITE_SENDERS,
} from "@/lib/auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { findCredential, loginInviteMessage } from "@/lib/wargaCredentials";

export async function addHousehold(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!HOUSEHOLD_CREATORS.includes(user.email)) return;

  const unit_no = String(formData.get("unit_no") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const phone_pasangan = String(formData.get("phone_pasangan") || "").trim();
  const alt_names = String(formData.get("alt_names") || "").trim();

  if (!unit_no || !name) return;

  const supabase = await createClient();

  await supabase.from("households").insert({
    unit_no,
    name,
    phone: phone || null,
    phone_pasangan: phone_pasangan || null,
    alt_names: alt_names || null,
  });

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "household.create",
    detail: `${unit_no} - ${name}`,
  });

  revalidatePath("/households");
}

// Lets a pengurus correct a warga's name or No. HP after the fact (e.g. a
// typo from import, or a resident switching numbers) — open to any
// pengurus, same as addHousehold, unlike toggleHouseholdActive which is
// restricted to HOUSEHOLD_TOGGLERS.
export async function updateHouseholdContact(
  id: string,
  formData: FormData
) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const alt_names = String(formData.get("alt_names") || "").trim();
  const phone_pasangan = String(formData.get("phone_pasangan") || "").trim();

  if (!name) return;

  const supabase = await createClient();

  await supabase
    .from("households")
    .update({
      name,
      phone: phone || null,
      alt_names: alt_names || null,
      phone_pasangan: phone_pasangan || null,
    })
    .eq("id", id);

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "household.update_contact",
    detail: `${id} -> ${name} / ${phone || "-"} / ${alt_names || "-"} / ${phone_pasangan || "-"}`,
  });

  revalidatePath("/households");
}

export async function toggleHouseholdActive(id: string, isActive: boolean) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!HOUSEHOLD_TOGGLERS.includes(user.email)) return;

  const supabase = await createClient();

  await supabase
    .from("households")
    .update({ is_active: !isActive })
    .eq("id", id);

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "household.toggle_active",
    detail: `${id} -> ${!isActive}`,
  });

  revalidatePath("/households");
}

// Sends a household's login username + password over WhatsApp via the
// active gateway (Fonnte/Wablas) — only used when settings.whatsapp_provider
// isn't "manual" (see households/page.tsx, which renders a different,
// wa.me-based button for that case instead of this action). Password comes
// from findCredential(), not a reset, so this only works for units created
// by the bulk script.
export async function sendLoginInvite(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!LOGIN_INVITE_SENDERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: household } = await supabase
    .from("households")
    .select("unit_no, phone, phone_pasangan")
    .eq("id", id)
    .single<{ unit_no: string; phone: string | null; phone_pasangan: string | null }>();

  if (!household?.phone) {
    redirect(
      "/households?wa_error=" + encodeURIComponent("No. HP belum diisi")
    );
  }

  const credential = findCredential(household!.unit_no);
  if (!credential) {
    redirect(
      "/households?wa_error=" +
        encodeURIComponent("Info login tidak ditemukan untuk unit ini")
    );
  }

  const message = loginInviteMessage(credential!.email, credential!.password);

  const result = await sendWhatsAppMessage(household!.phone!, message);

  // Sent one after another (not concurrently — back-to-back requests risk
  // the gateway flagging/rate-limiting the sends) with a pause between so
  // the two messages don't land on WhatsApp back-to-back either.
  let pasanganResult: Awaited<ReturnType<typeof sendWhatsAppMessage>> | null = null;
  if (household!.phone_pasangan) {
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    pasanganResult = await sendWhatsAppMessage(household!.phone_pasangan, message);
  }

  let updateError: string | null = null;
  if (result.success) {
    const { error } = await supabase
      .from("households")
      .update({ login_invite_sent_at: new Date().toISOString() })
      .eq("id", id);
    if (error) updateError = error.message;
  }

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: result.success ? "whatsapp.send" : "whatsapp.send_failed",
    detail: result.success
      ? `info login -> ${household!.phone} (${household!.unit_no}) - ${result.detail}${updateError ? ` - GAGAL UPDATE login_invite_sent_at: ${updateError}` : ""}`
      : `info login -> ${household!.phone} (${household!.unit_no}) - ${result.reason} - ${result.detail}`,
  });

  // Best-effort: doesn't affect the redirect/error below — that stays
  // tied to the main number.
  if (pasanganResult) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: pasanganResult.success ? "whatsapp.send" : "whatsapp.send_failed",
      detail: pasanganResult.success
        ? `info login (pasangan) -> ${household!.phone_pasangan} (${household!.unit_no}) - ${pasanganResult.detail}`
        : `info login (pasangan) -> ${household!.phone_pasangan} (${household!.unit_no}) - ${pasanganResult.reason} - ${pasanganResult.detail}`,
    });
  }

  if (!result.success) {
    redirect(`/households?wa_error=${encodeURIComponent(result.reason)}`);
  }

  redirect("/households?wa_success=1");
}

// Manual mode (settings.whatsapp_provider === "manual"): the message
// itself is sent by the pengurus via a wa.me link opened client-side (see
// KirimInfoLoginManualButton in households/page.tsx) — no gateway call
// happens here at all. This action only records that it was opened, with
// the same permission checks as sendLoginInvite above. Called directly
// from the client (not a <form action>), so it returns a result instead
// of redirecting.
export async function markLoginInviteSent(
  id: string,
  target: "phone" | "phone_pasangan"
): Promise<{ success: boolean }> {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return { success: false };
  if (!LOGIN_INVITE_SENDERS.includes(user.email)) return { success: false };

  const supabase = await createClient();

  const { data: household } = await supabase
    .from("households")
    .select("unit_no, phone, phone_pasangan")
    .eq("id", id)
    .single<{ unit_no: string; phone: string | null; phone_pasangan: string | null }>();

  const phone = target === "phone" ? household?.phone : household?.phone_pasangan;
  if (!phone) return { success: false };

  // Only the main number drives the "Terkirim"/"Kirim Ulang" status —
  // pasangan is best-effort, same as the gateway path above.
  if (target === "phone") {
    await supabase
      .from("households")
      .update({ login_invite_sent_at: new Date().toISOString() })
      .eq("id", id);
  }

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "whatsapp.manual_open",
    detail: `info login${target === "phone_pasangan" ? " (pasangan)" : ""} -> ${phone} (${household!.unit_no}) [manual/wa.me]`,
  });

  revalidatePath("/households");
  return { success: true };
}
