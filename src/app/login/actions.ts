"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MONTH_NAMES } from "@/lib/types";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Public, unauthenticated: lets a resident self-report a payment from the
// login page without an account. Always lands as status "pending" — never
// counts as Lunas until a pengurus confirms it from Pengaturan. Uses the
// admin client because there is no session here for RLS to key off of; the
// status is hardcoded server-side and never taken from form input.
export async function submitPaymentClaim(formData: FormData) {
  const household_id = String(formData.get("household_id") || "");
  const period_year = Number(formData.get("period_year"));
  const period_month = Number(formData.get("period_month"));
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") || "").trim();
  const receipt = formData.get("receipt");

  if (!household_id || !period_year || !period_month || !amount) {
    redirect(
      "/login?claim_error=" + encodeURIComponent("Lengkapi semua data wajib")
    );
  }

  const admin = createAdminClient();

  let receipt_path: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    const ext = receipt.name.split(".").pop() || "jpg";
    const path = `${household_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("bukti-transfer")
      .upload(path, receipt, { contentType: receipt.type });
    if (!uploadError) receipt_path = path;
  }

  const { error } = await admin.from("payments").insert({
    household_id,
    period_year,
    period_month,
    amount,
    note: note || null,
    status: "pending",
    receipt_path,
  });

  if (error) {
    if (receipt_path) {
      await admin.storage.from("bukti-transfer").remove([receipt_path]);
    }
    let message = error.message;
    if (error.code === "23505") {
      const { data: household } = await admin
        .from("households")
        .select("unit_no")
        .eq("id", household_id)
        .single<{ unit_no: string }>();
      const period = `${MONTH_NAMES[period_month - 1]} ${period_year}`;
      const unit = household?.unit_no ?? "rumah ini";
      message = `Periode ${period} untuk ${unit} sudah pernah dibayar atau sedang menunggu verifikasi`;
    }
    redirect(`/login?claim_error=${encodeURIComponent(message)}`);
  }

  await admin.from("activity_log").insert({
    actor_email: null,
    action: "payment.claim_pending",
    detail: `household ${household_id} - ${period_month}/${period_year} - ${amount}`,
  });

  redirect("/login?claim_success=1");
}
