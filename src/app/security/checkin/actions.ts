"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

// Public, unauthenticated submission (Absen Kehadiran) — same shape as
// paymentClaim.ts's createPendingPaymentClaim: no session, so everything
// goes through the admin client, and the guard is identified by
// guard_id + pin rather than an auth user. Lands as a "pending"
// security_checkins row; a pengurus confirms/rejects it from
// /security/kehadiran (see that route's actions.ts).
export async function submitCheckin(formData: FormData) {
  const guard_id = String(formData.get("guard_id") || "");
  const pin = String(formData.get("pin") || "").trim();
  const [shift_date, shift_type] = String(formData.get("shift_key") || "").split("|");
  const photo = formData.get("photo") as File | null;

  if (!guard_id || !pin) {
    redirect("/security/checkin?error=" + encodeURIComponent("Pilih nama dan isi PIN"));
  }
  if (!shift_date || (shift_type !== "pagi" && shift_type !== "malam")) {
    redirect("/security/checkin?error=" + encodeURIComponent("Shift tidak valid"));
  }
  if (!photo || photo.size === 0) {
    redirect("/security/checkin?error=" + encodeURIComponent("Foto wajib diisi"));
  }

  const admin = createAdminClient();

  const { data: guard } = await admin
    .from("security_guards")
    .select("id, pin, is_active")
    .eq("id", guard_id)
    .single<{ id: string; pin: string | null; is_active: boolean }>();

  if (!guard || !guard.is_active || !guard.pin || guard.pin !== pin) {
    redirect("/security/checkin?error=" + encodeURIComponent("Nama atau PIN salah"));
  }

  const ext = photo.name.split(".").pop() || "jpg";
  const path = `checkin/${guard_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("bukti-kehadiran")
    .upload(path, photo, { contentType: photo.type });
  if (uploadError) {
    redirect(
      "/security/checkin?error=" +
        encodeURIComponent("Gagal mengunggah foto: " + uploadError.message)
    );
  }

  const { error } = await admin.from("security_checkins").insert({
    guard_id,
    shift_date,
    shift_type,
    photo_path: path,
  });

  if (error) {
    await admin.storage.from("bukti-kehadiran").remove([path]);
    const message =
      error.code === "23505"
        ? "Sudah pernah absen untuk shift ini"
        : error.message;
    redirect("/security/checkin?error=" + encodeURIComponent(message));
  }

  redirect("/security/checkin?success=1");
}
