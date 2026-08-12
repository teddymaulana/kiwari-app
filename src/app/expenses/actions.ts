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

  if (!description || !amount || amount <= 0) return;

  const supabase = await createClient();

  await supabase.from("expenses").insert({
    description,
    amount,
    expense_date: expense_date || undefined,
    recorded_by: user.email,
  });

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "expense.create",
    detail: `${description} - ${amount}`,
  });

  revalidatePath("/expenses");
}
