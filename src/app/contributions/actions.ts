"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, CONTRIBUTION_RECORDERS, CONTRIBUTION_DELETERS } from "@/lib/auth";

export async function addContribution(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!CONTRIBUTION_RECORDERS.includes(user.email)) return;

  const household_id = String(formData.get("household_id") || "").trim();
  const source_name = String(formData.get("source_name") || "").trim();
  const event_name = String(formData.get("event_name") || "").trim();
  const amount = Number(formData.get("amount"));
  const contribution_date = String(formData.get("contribution_date") || "");
  const kas_type = String(formData.get("kas_type") || "bri");
  const note = String(formData.get("note") || "").trim();

  if (!event_name || !amount || amount <= 0) return;
  if (!household_id && !source_name) return;
  if (kas_type !== "tunai" && kas_type !== "bri") return;

  const supabase = await createClient();

  await supabase.from("contributions").insert({
    household_id: household_id || null,
    source_name: household_id ? null : source_name,
    event_name,
    amount,
    contribution_date: contribution_date || undefined,
    kas_type,
    note: note || null,
    recorded_by: user.email,
  });

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "contribution.create",
    detail: `${household_id ? `household ${household_id}` : `source "${source_name}"`} - ${event_name} - ${amount} - ${kas_type}`,
  });

  revalidatePath("/contributions");
  revalidatePath("/report");
  redirect("/contributions?success=1");
}

export async function deleteContribution(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!CONTRIBUTION_DELETERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: contribution } = await supabase
    .from("contributions")
    .delete()
    .eq("id", id)
    .select("household_id, source_name, event_name, amount")
    .single();

  if (contribution) {
    const origin = contribution.household_id
      ? `household ${contribution.household_id}`
      : `source "${contribution.source_name}"`;
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "contribution.delete",
      detail: `${origin} - ${contribution.event_name} - ${contribution.amount}`,
    });
  }

  revalidatePath("/contributions");
  revalidatePath("/report");
}

// Pulls a contribution out of Total Terkumpul/Kas Saat Ini without
// deleting it — e.g. while reconciling a discrepancy against an older
// manual (pre-app) report. Same permission as deleteContribution.
export async function excludeContribution(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!CONTRIBUTION_DELETERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: contribution } = await supabase
    .from("contributions")
    .update({ excluded: true })
    .eq("id", id)
    .select("household_id, source_name, event_name, amount")
    .single();

  if (contribution) {
    const origin = contribution.household_id
      ? `household ${contribution.household_id}`
      : `source "${contribution.source_name}"`;
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "contribution.exclude",
      detail: `${origin} - ${contribution.event_name} - ${contribution.amount}`,
    });
  }

  revalidatePath("/contributions");
  revalidatePath("/payments");
  revalidatePath("/report");
}

// Reverses excludeContribution.
export async function includeContribution(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!CONTRIBUTION_DELETERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: contribution } = await supabase
    .from("contributions")
    .update({ excluded: false })
    .eq("id", id)
    .select("household_id, source_name, event_name, amount")
    .single();

  if (contribution) {
    const origin = contribution.household_id
      ? `household ${contribution.household_id}`
      : `source "${contribution.source_name}"`;
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "contribution.include",
      detail: `${origin} - ${contribution.event_name} - ${contribution.amount}`,
    });
  }

  revalidatePath("/contributions");
  revalidatePath("/payments");
  revalidatePath("/report");
}
