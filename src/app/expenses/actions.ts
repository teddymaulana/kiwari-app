"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, EXPENSE_RECORDERS } from "@/lib/auth";

export async function addExpense(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!EXPENSE_RECORDERS.includes(user.email)) return;

  const description = String(formData.get("description") || "").trim();
  const amount = Number(formData.get("amount"));
  const expense_date = String(formData.get("expense_date") || "");
  const kas_type = String(formData.get("kas_type") || "bri");
  const receipt = formData.get("receipt") as File | null;

  if (!description || !amount || amount <= 0) {
    redirect("/expenses?error=" + encodeURIComponent("Keterangan dan jumlah wajib diisi"));
  }
  if (kas_type !== "tunai" && kas_type !== "bri") {
    redirect("/expenses?error=" + encodeURIComponent("Sumber kas tidak valid"));
  }

  // Storage has no policy on this private bucket (see schema.sql), so
  // uploading needs the service role — same as bukti-transfer for
  // payments (paymentClaim.ts).
  let receipt_path: string | null = null;
  if (receipt && receipt.size > 0) {
    const admin = createAdminClient();
    const ext = receipt.name.split(".").pop() || "jpg";
    const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("bukti-pengeluaran")
      .upload(path, receipt, { contentType: receipt.type });
    if (!uploadError) receipt_path = path;
  }

  const supabase = await createClient();

  const { error } = await supabase.from("expenses").insert({
    description,
    amount,
    expense_date: expense_date || undefined,
    kas_type,
    receipt_path,
    recorded_by: user.email,
  });

  if (error) {
    redirect("/expenses?error=" + encodeURIComponent(error.message));
  }

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "expense.create",
    detail: `${description} - ${amount} - ${kas_type}`,
  });

  revalidatePath("/expenses");
  revalidatePath("/report");
}

export async function releaseExpense(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const supabase = await createClient();

  const { data: expense } = await supabase
    .from("expenses")
    .update({ status: "released" })
    .eq("id", id)
    .select("description, amount")
    .single();

  if (expense) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "expense.release",
      detail: `${expense.description} - ${expense.amount}`,
    });
  }

  revalidatePath("/expenses");
  revalidatePath("/report");
}

// Releases exactly the draft ids passed in (the currently-visible set on
// the page, respecting whatever month filter is active) rather than every
// draft ever recorded — bulk version of releaseExpense above.
export async function releaseAllDrafts(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const ids = formData.getAll("ids").map(String);
  if (ids.length === 0) return;

  const supabase = await createClient();

  const { data: released } = await supabase
    .from("expenses")
    .update({ status: "released" })
    .eq("status", "draft")
    .in("id", ids)
    .select("description, amount");

  if (released && released.length > 0) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "expense.release_all",
      detail: `${released.length} pengeluaran dirilis`,
    });
  }

  revalidatePath("/expenses");
  revalidatePath("/report");
}

export async function deleteExpense(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!EXPENSE_RECORDERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: expense } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .select("description, amount")
    .single();

  if (expense) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "expense.delete",
      detail: `${expense.description} - ${expense.amount}`,
    });
  }

  revalidatePath("/expenses");
  revalidatePath("/report");
}
