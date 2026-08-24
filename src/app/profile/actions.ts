"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

// Lets a logged-in warga update their own household's phone numbers (own
// + pasangan) — the household comes from their session, never from form
// input, so they can only ever edit their own record. Regular UPDATE on
// households is pengurus-only (see schema.sql), so this goes through the
// admin client; authorization is enforced here in the action, not by RLS.
export async function updatePhone(formData: FormData) {
  const user = await getCurrentUser();
  if (!user?.householdId) {
    redirect(
      "/profile?error=" +
        encodeURIComponent("Rumah belum ditautkan, hubungi pengurus")
    );
  }

  const phone = String(formData.get("phone") || "").trim();
  const phone_pasangan = String(formData.get("phone_pasangan") || "").trim();

  const admin = createAdminClient();
  await admin
    .from("households")
    .update({ phone: phone || null, phone_pasangan: phone_pasangan || null })
    .eq("id", user.householdId);

  // Regular activity_log writes are pengurus-only (see schema.sql RLS) —
  // use the admin client here since a warga is the one making this edit.
  await admin.from("activity_log").insert({
    actor_email: user.email,
    action: "profile.update_phone",
    detail: `household ${user.householdId} -> ${phone || "(kosong)"} / pasangan ${phone_pasangan || "(kosong)"}`,
  });

  revalidatePath("/profile");
  redirect("/profile?success=1");
}

// Self-service password change — any logged-in user (warga or pengurus).
// Uses the regular session-bound client for the actual auth update (so
// it's genuinely "change your own password", not an admin override), but
// the audit log entry needs the admin client since a warga's regular
// client can't write activity_log under RLS (pengurus-only there).
export async function updatePassword(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const newPassword = String(formData.get("new_password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (newPassword.length < 6) {
    redirect(
      "/profile?pw_error=" +
        encodeURIComponent("Password baru minimal 6 karakter")
    );
  }
  if (newPassword !== confirmPassword) {
    redirect(
      "/profile?pw_error=" +
        encodeURIComponent("Konfirmasi password tidak cocok")
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect(`/profile?pw_error=${encodeURIComponent(error.message)}`);
  }

  const admin = createAdminClient();
  await admin.from("activity_log").insert({
    actor_email: user.email,
    action: "profile.update_password",
    detail: `user ${user.id} (${user.email})`,
  });

  redirect("/profile?pw_success=1");
}
