"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPendingPaymentClaim } from "@/lib/paymentClaim";

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
// login page without an account.
export async function submitPaymentClaim(formData: FormData) {
  const household_id = String(formData.get("household_id") || "");
  const period_year = Number(formData.get("period_year"));
  const period_months = formData
    .getAll("period_months")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  const note = String(formData.get("note") || "").trim();
  const receipt = formData.get("receipt");

  if (!household_id || !period_year || period_months.length === 0) {
    redirect(
      "/login?claim_error=" + encodeURIComponent("Lengkapi semua data wajib")
    );
  }

  const result = await createPendingPaymentClaim({
    householdId: household_id,
    periodYear: period_year,
    periodMonths: period_months,
    note,
    receipt: receipt instanceof File ? receipt : null,
    actorEmail: null,
  });

  if (!result.success) {
    redirect(`/login?claim_error=${encodeURIComponent(result.message)}`);
  }

  redirect(`/login?claim_success=${encodeURIComponent(result.message)}`);
}
