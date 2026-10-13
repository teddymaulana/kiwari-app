"use server";

import { redirect } from "next/navigation";
import { savePatrol } from "@/lib/securitySubmit";

// Public, unauthenticated submission (Laporan Patroli) — same treatment
// as security/checkin/actions.ts's submitCheckin: no session, admin
// client, guard identified by guard_id + pin. Unlike a checkin, this
// isn't attendance proof so it's inserted directly with no pending/
// confirm step — pengurus just reads it from /security/kehadiran. The
// write itself lives in lib/securitySubmit.ts, shared with the Android
// app's API.
export async function submitPatrol(formData: FormData) {
  const [shift_date, shift_type] = String(formData.get("shift_key") || "").split("|");
  const { error } = await savePatrol({
    guard_id: String(formData.get("guard_id") || ""),
    pin: String(formData.get("pin") || "").trim(),
    shift_date: shift_date ?? "",
    shift_type: shift_type ?? "",
    report: String(formData.get("report") || "").trim(),
    photo: formData.get("photo") as File | null,
  });

  if (error) {
    redirect("/security/patroli?error=" + encodeURIComponent(error));
  }
  redirect("/security/patroli?success=1");
}
