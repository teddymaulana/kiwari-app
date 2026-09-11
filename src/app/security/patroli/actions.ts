"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

// Public, unauthenticated submission (Laporan Patroli) — same treatment
// as security/checkin/actions.ts's submitCheckin: no session, admin
// client, guard identified by guard_id + pin. Unlike a checkin, this
// isn't attendance proof so it's inserted directly with no pending/
// confirm step — pengurus just reads it from /security/kehadiran.
export async function submitPatrol(formData: FormData) {
  const guard_id = String(formData.get("guard_id") || "");
  const pin = String(formData.get("pin") || "").trim();
  const [shift_date, shift_type] = String(formData.get("shift_key") || "").split("|");
  const report = String(formData.get("report") || "").trim();
  const photo = formData.get("photo") as File | null;

  if (!guard_id || !pin) {
    redirect("/security/patroli?error=" + encodeURIComponent("Pilih nama dan isi PIN"));
  }
  if (!shift_date || (shift_type !== "pagi" && shift_type !== "malam")) {
    redirect("/security/patroli?error=" + encodeURIComponent("Shift tidak valid"));
  }

  const admin = createAdminClient();

  const { data: guard } = await admin
    .from("security_guards")
    .select("id, pin, is_active")
    .eq("id", guard_id)
    .single<{ id: string; pin: string | null; is_active: boolean }>();

  if (!guard || !guard.is_active || !guard.pin || guard.pin !== pin) {
    redirect("/security/patroli?error=" + encodeURIComponent("Nama atau PIN salah"));
  }

  let photo_path: string | null = null;
  if (photo && photo.size > 0) {
    const ext = photo.name.split(".").pop() || "jpg";
    const path = `patrol/${guard_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("bukti-kehadiran")
      .upload(path, photo, { contentType: photo.type });
    if (!uploadError) photo_path = path;
  }

  const { error } = await admin.from("security_patrols").insert({
    guard_id,
    shift_date,
    shift_type,
    report,
    photo_path,
  });

  if (error) {
    if (photo_path) await admin.storage.from("bukti-kehadiran").remove([photo_path]);
    const message =
      error.code === "23505"
        ? "Sudah pernah lapor patroli untuk shift ini"
        : error.message;
    redirect("/security/patroli?error=" + encodeURIComponent(message));
  }

  redirect("/security/patroli?success=1");
}
