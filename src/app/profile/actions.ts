"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";

// Lets a logged-in warga update their own household's phone number — the
// household comes from their session, never from form input, so they can
// only ever edit their own record. Regular UPDATE on households is
// pengurus-only (see schema.sql), so this goes through the admin client;
// authorization is enforced here in the action, not by RLS.
export async function updatePhone(formData: FormData) {
  const user = await getCurrentUser();
  if (!user?.householdId) {
    redirect(
      "/profile?error=" +
        encodeURIComponent("Rumah belum ditautkan, hubungi pengurus")
    );
  }

  const phone = String(formData.get("phone") || "").trim();

  const admin = createAdminClient();
  await admin
    .from("households")
    .update({ phone: phone || null })
    .eq("id", user.householdId);

  // Regular activity_log writes are pengurus-only (see schema.sql RLS) —
  // use the admin client here since a warga is the one making this edit.
  await admin.from("activity_log").insert({
    actor_email: user.email,
    action: "profile.update_phone",
    detail: `household ${user.householdId} -> ${phone || "(kosong)"}`,
  });

  revalidatePath("/profile");
  redirect("/profile?success=1");
}
