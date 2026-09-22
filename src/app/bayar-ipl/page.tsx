import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { logPageView } from "@/lib/pageView";
import BayarIplForm from "./BayarIplForm";
import ClaimSuccessCard from "@/components/ClaimSuccessCard";
import { iplFirstMonth } from "@/lib/types";
import type { Payment, Settings } from "@/lib/types";

// The Bayar IPL claim (./actions.ts, via createPendingPaymentClaim ->
// sendViaWablas) can wait up to TIMEOUT_MS (wablas.ts, currently 45s) for
// a slow Wablas reply while notifying 18G of the new claim — see the same
// comment on humas/page.tsx for why this is needed alongside that timeout.
export const maxDuration = 60;

export default async function BayarIplPage({
  searchParams,
}: {
  searchParams: Promise<{ claim_error?: string; claim_success?: string }>;
}) {
  const { claim_error, claim_success } = await searchParams;
  const user = await getCurrentUser();

  await logPageView(user, "bayar-ipl");

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
  const firstMonth = iplFirstMonth(year);
  const unpaidMonths = Array.from(
    { length: 12 - firstMonth + 1 },
    (_, i) => i + firstMonth
  ).filter((m) => !paidMonths.has(m));

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
