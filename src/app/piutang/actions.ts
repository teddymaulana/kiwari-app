"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, PERSONNEL_LOAN_DELETERS } from "@/lib/auth";

export async function addPersonnelLoan(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;

  const person_name = String(formData.get("person_name") || "").trim();
  const transaction_type = String(formData.get("transaction_type") || "");
  const amount = Number(formData.get("amount"));
  const transaction_date = String(formData.get("transaction_date") || "");
  const kas_type = String(formData.get("kas_type") || "bri");
  const note = String(formData.get("note") || "").trim();

  if (!person_name || !amount || amount <= 0) return;
  if (transaction_type !== "pinjam" && transaction_type !== "bayar") return;
  if (kas_type !== "tunai" && kas_type !== "bri") return;

  const supabase = await createClient();

  await supabase.from("personnel_loans").insert({
    person_name,
    transaction_type,
    amount,
    transaction_date: transaction_date || undefined,
    kas_type,
    note: note || null,
    recorded_by: user.email,
  });

  await supabase.from("activity_log").insert({
    actor_email: user.email,
    action: "personnel_loan.create",
    detail: `${person_name} - ${transaction_type} - ${amount} - ${kas_type}`,
  });

  revalidatePath("/piutang");
  revalidatePath("/report");
}

export async function deletePersonnelLoan(id: string) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") return;
  if (!PERSONNEL_LOAN_DELETERS.includes(user.email)) return;

  const supabase = await createClient();

  const { data: loan } = await supabase
    .from("personnel_loans")
    .delete()
    .eq("id", id)
    .select("person_name, transaction_type, amount")
    .single();

  if (loan) {
    await supabase.from("activity_log").insert({
      actor_email: user.email,
      action: "personnel_loan.delete",
      detail: `${loan.person_name} - ${loan.transaction_type} - ${loan.amount}`,
    });
  }

  revalidatePath("/piutang");
  revalidatePath("/report");
}
