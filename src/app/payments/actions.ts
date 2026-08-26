"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, PAYMENT_DELETERS } from "@/lib/auth";

// Deletes any payment row regardless of status — unlike rejectPaymentClaim
// (payments/new/actions.ts), which only removes a still-unconfirmed claim,
// this also covers a *confirmed* payment recorded by mistake, or one whose
// bank transfer later turned out not to have actually gone through.
export async function deletePayment(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!PAYMENT_DELETERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .delete()
    .eq("id", id)
    .select("household_id, period_year, period_month, amount, status")
    .single();

  if (payment) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "payment.delete",
      detail: `household ${payment.household_id} - ${payment.period_month}/${payment.period_year} - ${payment.amount} (${payment.status})`,
    });
  }

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/report");
}

// Pulls a confirmed payment out of every Lunas/total calculation without
// deleting it — e.g. while reconciling a discrepancy against an older
// manual (pre-app) report. Same permission as deletePayment since it's an
// equally sensitive correction to a recorded payment.
export async function excludePayment(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!PAYMENT_DELETERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .update({ excluded: true })
    .eq("id", id)
    .select("household_id, period_year, period_month, amount")
    .single();

  if (payment) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "payment.exclude",
      detail: `household ${payment.household_id} - ${payment.period_month}/${payment.period_year} - ${payment.amount}`,
    });
  }

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/report");
}

// Reverses excludePayment.
export async function includePayment(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!PAYMENT_DELETERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .update({ excluded: false })
    .eq("id", id)
    .select("household_id, period_year, period_month, amount")
    .single();

  if (payment) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "payment.include",
      detail: `household ${payment.household_id} - ${payment.period_month}/${payment.period_year} - ${payment.amount}`,
    });
  }

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/report");
}
