"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export async function addExpense(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const description = String(formData.get("description") || "").trim();
  const amount = Number(formData.get("amount"));
  const expense_date = String(formData.get("expense_date") || "");
  const kas_type = String(formData.get("kas_type") || "bri");

  if (!description || !amount || amount <= 0) return;
  if (kas_type !== "tunai" && kas_type !== "bri") return;

  const supabase = await createClient();

  await supabase.from("expenses").insert({
    description,
    amount,
    expense_date: expense_date || undefined,
    kas_type,
    recorded_by: user.email,
  });

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "expense.create",
    detail: `${description} - ${amount} - ${kas_type}`,
  });

  revalidatePath("/expenses");
  revalidatePath("/report");
}

export async function deleteExpense(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

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
