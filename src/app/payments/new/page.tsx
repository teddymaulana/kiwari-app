import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import RecordPaymentForm from "./RecordPaymentForm";
import type { Household, Settings } from "@/lib/types";
import { compareUnitNo } from "@/lib/types";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: households }, { data: settings }] = await Promise.all([
    supabase
      .from("households")
      .select("*")
      .eq("is_active", true)
      .returns<Household[]>(),
    supabase.from("settings").select("*").eq("id", 1).single<Settings>(),
  ]);

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-6">
        Catat Pembayaran Iuran
      </h1>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <RecordPaymentForm
        households={households ?? []}
        defaultAmount={settings?.monthly_amount ?? 50000}
      />
    </div>
  );
}
