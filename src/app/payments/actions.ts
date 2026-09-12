"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, PAYMENT_RECORDERS, PAYMENT_DELETERS } from "@/lib/auth";

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

// Marks one household's IPL for one month as not owed — see the
// ipl_exemptions comment in schema.sql. Same permission as recordPayments
// since this is really an alternate way of settling a month (just with no
// money attached) rather than a correction. Blocked if a payment row
// already exists for that period — one or the other, not both.
export async function addIplExemption(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!PAYMENT_RECORDERS.includes(user.email)) return;

  const household_id = String(formData.get("household_id") || "");
  const period_year = Number(formData.get("period_year"));
  const period_month = Number(formData.get("period_month"));
  const note = String(formData.get("note") || "").trim();

  if (!household_id || !period_year || period_month < 1 || period_month > 12) {
    return;
  }

  const supabase = await createClient();

  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("household_id", household_id)
    .eq("period_year", period_year)
    .eq("period_month", period_month)
    .maybeSingle();
  if (existingPayment) return;

  const { error } = await supabase.from("ipl_exemptions").insert({
    household_id,
    period_year,
    period_month,
    note: note || null,
    created_by: user.email,
  });

  if (!error) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "ipl_exemption.create",
      detail: `household ${household_id} - ${period_month}/${period_year}${note ? ` - ${note}` : ""}`,
    });
  }

  revalidatePath("/payments");
  revalidatePath("/dashboard");
  revalidatePath("/report");
}

// Reverses addIplExemption.
export async function removeIplExemption(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!PAYMENT_RECORDERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: exemption } = await supabase
    .from("ipl_exemptions")
    .delete()
    .eq("id", id)
    .select("household_id, period_year, period_month")
    .single();

  if (exemption) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "ipl_exemption.delete",
      detail: `household ${exemption.household_id} - ${exemption.period_month}/${exemption.period_year}`,
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
