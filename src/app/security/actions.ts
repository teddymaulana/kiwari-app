"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
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
