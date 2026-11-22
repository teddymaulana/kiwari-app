"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, SECURITY_KEHADIRAN_ACCESS } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { jakartaMonth, monthRange } from "@/lib/securityPhotos";

export async function setGuardPin(guardId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!SECURITY_KEHADIRAN_ACCESS.includes(user.email)) return;

  const pin = String(formData.get("pin") || "").trim();
  if (!/^\d{4,6}$/.test(pin)) {
    redirect(
      "/security/kehadiran?error=" +
        encodeURIComponent("PIN harus 4-6 digit angka")
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("security_guards")
    .update({ pin })
    .eq("id", guardId);

  if (error) {
    redirect("/security/kehadiran?error=" + encodeURIComponent(error.message));
  }

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "security.set_pin",
    detail: `guard ${guardId}`,
  });

  revalidatePath("/security/kehadiran");
}

export async function rejectCheckin(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!SECURITY_KEHADIRAN_ACCESS.includes(user.email)) return;

  const supabase = await createClient();
  const { data: checkin, error } = await supabase
    .from("security_checkins")
    .update({
      status: "rejected",
      confirmed_by: user.email,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("guard_id, shift_date, shift_type")
    .maybeSingle();

  // No row back means nothing changed (e.g. blocked by RLS) — say so
  // instead of leaving the entry sitting there with no feedback.
  if (!checkin) {
    redirect(
      "/security/kehadiran?error=" +
        encodeURIComponent(error?.message ?? "Gagal menyimpan, data tidak berubah")
    );
  }

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "security.reject_checkin",
    detail: `${id} - ${checkin.shift_date} ${checkin.shift_type}`,
  });

  revalidatePath("/security/kehadiran");
}

// Arsip Foto: after a month's ZIP has downloaded, delete exactly the
// photos that went into it (the client passes their row ids). Only past
// months, and only rows whose shift_date is in that month. Rows keep
// their photo_path; /api/bukti then says the photo was archived.
export async function deleteArchivedPhotos(
  month: string,
  ids: { checkin: string[]; patrol: string[]; patrolPhoto?: string[] }
): Promise<{ deleted?: number; error?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return { error: "Tidak diizinkan" };
  if (!SECURITY_KEHADIRAN_ACCESS.includes(user.email)) return { error: "Tidak diizinkan" };

  const range = monthRange(month);
  if (!range) return { error: "Bulan tidak valid" };
  if (month >= jakartaMonth()) {
    return { error: "Foto bulan berjalan belum bisa dihapus" };
  }

  const admin = createAdminClient();
  const paths: string[] = [];
  for (const [table, list] of [
    ["security_checkins", ids.checkin],
    ["security_patrols", ids.patrol],
  ] as const) {
    for (let i = 0; i < list.length; i += 200) {
      const { data, error } = await admin
        .from(table)
        .select("photo_path")
        .in("id", list.slice(i, i + 200))
        .gte("shift_date", range.from)
        .lte("shift_date", range.to)
        .returns<{ photo_path: string | null }[]>();
      if (error) return { error: error.message };
      data.forEach((r) => r.photo_path && paths.push(r.photo_path));
    }
  }

  // Patroli photos 2–5: only those belonging to patrols in that month.
  const extraIds = ids.patrolPhoto ?? [];
  for (let i = 0; i < extraIds.length; i += 200) {
    const { data, error } = await admin
      .from("security_patrol_photos")
      .select("photo_path, security_patrols!inner(shift_date)")
      .in("id", extraIds.slice(i, i + 200))
      .gte("security_patrols.shift_date", range.from)
      .lte("security_patrols.shift_date", range.to)
      .returns<{ photo_path: string | null }[]>();
    if (error) return { error: error.message };
    data.forEach((r) => r.photo_path && paths.push(r.photo_path));
  }

  let deleted = 0;
  for (let i = 0; i < paths.length; i += 500) {
    const { data, error } = await admin.storage
      .from("bukti-kehadiran")
      .remove(paths.slice(i, i + 500));
    if (error) return { error: "Gagal menghapus foto: " + error.message, deleted };
    deleted += data?.length ?? 0;
  }

  const supabase = await createClient();
  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "security.delete_archived_photos",
    detail: `${month}: ${deleted} foto`,
  });

  return { deleted };
}
