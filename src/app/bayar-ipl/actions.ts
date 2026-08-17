"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createPendingPaymentClaim } from "@/lib/paymentClaim";

// Same claim flow as the public "Bayar IPL" form on /login, but for a
// logged-in warga — the household comes from their session, never from
// form input, so they can only ever claim a payment for their own unit.
export async function submitOwnPaymentClaim(formData: FormData) {
  const user = await getCurrentUser();
  if (!user?.householdId) {
    redirect(
      "/bayar-ipl?claim_error=" +
        encodeURIComponent("Rumah belum ditautkan, hubungi pengurus")
    );
  }

  const period_year = Number(formData.get("period_year"));
  const period_months = formData
    .getAll("period_months")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  const note = String(formData.get("note") || "").trim();
  const receipt = formData.get("receipt");

  if (!period_year || period_months.length === 0) {
    redirect(
      "/bayar-ipl?claim_error=" +
        encodeURIComponent("Lengkapi semua data wajib")
    );
  }

  const result = await createPendingPaymentClaim({
    householdId: user.householdId,
    periodYear: period_year,
    periodMonths: period_months,
    note,
    receipt: receipt instanceof File ? receipt : null,
    actorEmail: user.email,
  });

  if (!result.success) {
    redirect(`/bayar-ipl?claim_error=${encodeURIComponent(result.message)}`);
  }

  redirect(`/bayar-ipl?claim_success=${encodeURIComponent(result.message)}`);
}
