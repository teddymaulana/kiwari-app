import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import BayarIplForm from "./BayarIplForm";
import ClaimSuccessCard from "@/components/ClaimSuccessCard";
import type { Payment, Settings } from "@/lib/types";

export default async function BayarIplPage({
  searchParams,
}: {
  searchParams: Promise<{ claim_error?: string; claim_success?: string }>;
}) {
  const { claim_error, claim_success } = await searchParams;
  const user = await getCurrentUser();

  if (!user?.householdId) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-gray-900 mb-6">
          Bayar IPL
        </h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          Rumah belum ditautkan ke akun ini, hubungi pengurus.
        </div>
      </div>
    );
  }

  const year = new Date().getFullYear();

  const supabase = await createClient();
  const [{ data: settings }, { data: existing }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).single<Settings>(),
    supabase
      .from("payments")
      .select("period_month")
      .eq("household_id", user.householdId)
      .eq("period_year", year)
      .returns<Pick<Payment, "period_month">[]>(),
  ]);

  const paidMonths = new Set((existing ?? []).map((p) => p.period_month));
  const unpaidMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(
    (m) => !paidMonths.has(m)
  );

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Bayar IPL</h1>
      <p className="text-sm text-gray-500 mb-6">
        Sudah transfer? Kirim klaim di sini. Pengurus akan verifikasi
        sebelum tercatat Lunas.
      </p>

      {claim_error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {claim_error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {claim_success ? (
          <ClaimSuccessCard message={claim_success} resetHref="/bayar-ipl" />
        ) : (
          <BayarIplForm
            defaultAmount={settings?.monthly_amount ?? 50000}
            year={year}
            unpaidMonths={unpaidMonths}
          />
        )}
      </div>
    </div>
  );
}
