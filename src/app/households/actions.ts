"use server";

import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, HOUSEHOLD_TOGGLERS } from "@/lib/auth";
import { sendWhatsAppMessage } from "@/lib/fonnte";

// Looks up a unit's login credentials from warga_credentials.csv — the
// one-time output of the bulk warga-account-creation script (see
// create_warga_users.js). Supabase Auth never stores plaintext passwords,
// so this CSV is the only place they still exist; only units created by
// that script (status "OK") have a row here.
function findCredential(unitNo: string): { email: string; password: string } | null {
  const csvPath = path.join(process.cwd(), "warga_credentials.csv");
  let csv: string;
  try {
    csv = fs.readFileSync(csvPath, "utf8");
  } catch {
    return null;
  }
  for (const line of csv.split("\n").slice(1)) {
    const m = line.match(/^([^,]+),"([^"]*)",([^,]+),([^,]*),(.+)$/);
    if (m && m[1].trim() === unitNo && m[5].trim() === "OK") {
      return { email: m[3].trim(), password: m[4].trim() };
    }
  }
  return null;
}

export async function addHousehold(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

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

  if (!name) return;

  const supabase = await createClient();

  await supabase
    .from("households")
    .update({ name, phone: phone || null })
    .eq("id", id);

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "household.update_contact",
    detail: `${id} -> ${name} / ${phone || "-"}`,
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

// Sends a household's login username + password over WhatsApp — only ever
// triggered by a pengurus clicking "Kirim Info Login" for that one row, never
// automatic. Password comes from findCredential() (see above), not a reset,
// so this only works for units created by the bulk script.
export async function sendLoginInvite(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const supabase = await createClient();

  // Only applies to households actually linked to a pengurus-role login
  // (profiles.role = 'pengurus') — not every warga.
  const { data: pengurusProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("household_id", id)
    .eq("role", "pengurus")
    .maybeSingle();
  if (!pengurusProfile) return;

  const { data: household } = await supabase
    .from("households")
    .select("unit_no, phone")
    .eq("id", id)
    .single<{ unit_no: string; phone: string | null }>();

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

  const message = `Halo, berikut info login akun Anda untuk aplikasi Kiwari Residence (IPL):\n\nUsername: ${credential!.email}\nPassword: ${credential!.password}\n\nLogin di: https://kiwari-app.vercel.app/`;

  const result = await sendWhatsAppMessage(household!.phone!, message);

  if (result.success) {
    await supabase
      .from("households")
      .update({ login_invite_sent_at: new Date().toISOString() })
      .eq("id", id);
  }

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: result.success ? "whatsapp.send" : "whatsapp.send_failed",
    detail: result.success
      ? `info login -> ${household!.phone} (${household!.unit_no})`
      : `info login -> ${household!.phone} (${household!.unit_no}) - ${result.reason}`,
  });

  if (!result.success) {
    redirect(`/households?wa_error=${encodeURIComponent(result.reason)}`);
  }

  redirect("/households?wa_success=1");
}
