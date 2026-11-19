"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, SECURITY_ALERT_SENDERS } from "@/lib/auth";
import { pushSecurityAlert } from "@/lib/securityPush";
import { findOffsetAfter, generateRotationShifts } from "@/lib/securityRotation";
import type { ShiftType } from "@/lib/types";

// Extends the schedule one calendar month past whatever's currently the
// latest recorded shift, by continuing each guard's own 5-day rotation
// (see securityRotation.ts) — this is a guess based on the pattern
// holding, not a real schedule pengurus has committed to, so every
// generated row is tagged in `note` and can be corrected the same way
// any other shift row can (there's no separate "approve" step; this
// isn't destructive since it only ever inserts new dates, never
// overwrites an existing row — onConflict here is a no-op safety net,
// not an expected path).
export async function generateNextMonth() {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/security");

  const supabase = await createClient();

  const { data: guards } = await supabase
    .from("security_guards")
    .select("id")
    .eq("is_active", true)
    .returns<{ id: string }[]>();

  if (!guards || guards.length === 0) {
    redirect("/security?error=" + encodeURIComponent("Belum ada data security"));
  }

  const { data: latest } = await supabase
    .from("security_shifts")
    .select("shift_date")
    .order("shift_date", { ascending: false })
    .limit(1)
    .maybeSingle<{ shift_date: string }>();

  if (!latest) {
    redirect(
      "/security?error=" + encodeURIComponent("Belum ada jadwal untuk dijadikan acuan")
    );
  }

  const lastDate = new Date(latest.shift_date + "T00:00:00");
  const nextMonthStart = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 1);
  const daysInNextMonth = new Date(
    nextMonthStart.getFullYear(),
    nextMonthStart.getMonth() + 1,
    0
  ).getDate();
  const startDateStr = `${nextMonthStart.getFullYear()}-${String(
    nextMonthStart.getMonth() + 1
  ).padStart(2, "0")}-01`;

  const allRows: {
    guard_id: string;
    shift_date: string;
    shift_type: ShiftType;
    recorded_by: string;
    note: string;
  }[] = [];
  let skipped = 0;

  for (const g of guards) {
    const { data: recent } = await supabase
      .from("security_shifts")
      .select("shift_date, shift_type")
      .eq("guard_id", g.id)
      .order("shift_date", { ascending: false })
      .limit(5)
      .returns<{ shift_date: string; shift_type: ShiftType }[]>();

    const ascending = (recent ?? []).slice().reverse();
    const offset = findOffsetAfter(ascending);
    if (offset === null) {
      skipped++;
      continue;
    }

    generateRotationShifts(offset, startDateStr, daysInNextMonth).forEach((r) => {
      allRows.push({
        guard_id: g.id,
        shift_date: r.shift_date,
        shift_type: r.shift_type,
        recorded_by: user.email,
        note: "Auto-generated dari pola rotasi 5 hari",
      });
    });
  }

  if (allRows.length > 0) {
    const { error } = await supabase
      .from("security_shifts")
      .upsert(allRows, { onConflict: "guard_id,shift_date", ignoreDuplicates: true });
    if (error) {
      redirect("/security?error=" + encodeURIComponent(error.message));
    }

    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "security.generate_schedule",
      detail: `${startDateStr.slice(0, 7)} - ${allRows.length} shift digenerate${
        skipped > 0 ? `, ${skipped} guard dilewati (pola terputus)` : ""
      }`,
    });
  }

  revalidatePath("/security");

  if (skipped > 0) {
    redirect(
      "/security?month=" +
        (nextMonthStart.getMonth() + 1) +
        "&error=" +
        encodeURIComponent(
          `${skipped} guard tidak bisa digenerate otomatis (pola terputus) — isi manual untuk mereka.`
        )
    );
  }
  redirect(`/security?month=${nextMonthStart.getMonth() + 1}`);
}

// Alert Sekuriti — a resident's message (+ optional photo) for the guards
// on duty, picked up by the Android security app polling
// /api/security/alerts. Limited to SECURITY_ALERT_SENDERS for now; widen
// this check, the page gate and the security_alerts read policy together
// when opening it to other pengurus or warga.
// Returns a result instead of redirecting so the form can show it inline.
const ALERT_MAX_LENGTH = 1000;

export async function sendSecurityAlert(
  formData: FormData
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus" || !SECURITY_ALERT_SENDERS.includes(user.email)) {
    return { error: "Tidak diizinkan" };
  }

  const message = String(formData.get("message") || "").trim();
  if (!message) return { error: "Isi pesan alert dulu" };
  if (message.length > ALERT_MAX_LENGTH) {
    return { error: `Pesan terlalu panjang (maks ${ALERT_MAX_LENGTH} karakter)` };
  }

  const admin = createAdminClient();
  const photo = formData.get("photo");
  let photo_path: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) return { error: "File harus berupa foto" };
    const path = `alert/${user.id}/${Date.now()}-${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await admin.storage
      .from("bukti-kehadiran")
      .upload(path, photo, { contentType: photo.type });
    if (uploadError) return { error: "Gagal mengunggah foto: " + uploadError.message };
    photo_path = path;
  }

  const { data: inserted, error } = await admin
    .from("security_alerts")
    .insert({
      created_by: user.id,
      household_id: user.householdId,
      message,
      photo_path,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) {
    if (photo_path) await admin.storage.from("bukti-kehadiran").remove([photo_path]);
    return { error: error.message };
  }

  await pushSecurityAlert({ id: inserted.id, message, unitNo: user.unitNo });

  revalidatePath("/security");
  return {};
}

// Pengurus closes an alert once it's dealt with — the app stops showing
// it either way once a guard has tapped "Saya Tangani".
export async function resolveSecurityAlert(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus" || !SECURITY_ALERT_SENDERS.includes(user.email)) {
    redirect("/security");
  }

  const id = String(formData.get("id") || "");
  const admin = createAdminClient();
  const { error } = await admin
    .from("security_alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "resolved");
  if (error) redirect("/security?error=" + encodeURIComponent(error.message));
  revalidatePath("/security");
}
