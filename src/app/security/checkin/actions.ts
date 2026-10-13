"use server";

import { redirect } from "next/navigation";
import { saveCheckin } from "@/lib/securitySubmit";

// Public, unauthenticated submission (Absen Kehadiran) — same shape as
// paymentClaim.ts's createPendingPaymentClaim: no session, so everything
// goes through the admin client, and the guard is identified by
// guard_id + pin rather than an auth user. Lands as a "pending"
// security_checkins row; a pengurus confirms/rejects it from
// /security/kehadiran (see that route's actions.ts). The write itself
// lives in lib/securitySubmit.ts, shared with the Android app's API.
export async function submitCheckin(formData: FormData) {
  const [shift_date, shift_type] = String(formData.get("shift_key") || "").split("|");
  const { error } = await saveCheckin({
    guard_id: String(formData.get("guard_id") || ""),
    pin: String(formData.get("pin") || "").trim(),
    shift_date: shift_date ?? "",
    shift_type: shift_type ?? "",
    photo: formData.get("photo") as File | null,
  });

  if (error) {
    redirect("/security/checkin?error=" + encodeURIComponent(error));
  }
  redirect("/security/checkin?success=1");
}
