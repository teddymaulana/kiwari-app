import { signIn } from "./actions";
import BayarIplForm from "./BayarIplForm";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Household, Settings } from "@/lib/types";
import { compareUnitNo } from "@/lib/types";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    claim_error?: string;
    claim_success?: string;
  }>;
}) {
  const { error, claim_error, claim_success } = await searchParams;

  // Public page — no session here, so this can't go through the regular
  // RLS-scoped client. Read-only, non-sensitive fields only.
  const admin = createAdminClient();
  const [{ data: households }, { data: settings }] = await Promise.all([
    admin
      .from("households")
      .select("id, unit_no, name")
      .eq("is_active", true)
      .returns<Pick<Household, "id" | "unit_no" | "name">[]>(),
    admin.from("settings").select("*").eq("id", 1).single<Settings>(),
  ]);

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  const bayarIplBody = (
    <>
      <p className="text-sm text-gray-500 mb-6">
        Sudah transfer? Klaim pembayaran di sini, tanpa perlu login. Pengurus
        akan verifikasi sebelum tercatat Lunas.
      </p>

      {claim_error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {claim_error}
        </div>
      )}
      {claim_success && (
        <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          {claim_success}
        </div>
      )}

      <BayarIplForm
        households={households ?? []}
        defaultAmount={settings?.monthly_amount ?? 50000}
        year={new Date().getFullYear()}
      />
    </>
  );

  const loginBody = (
    <>
      <p className="text-sm text-gray-500 mb-6">
        Login untuk pengurus dan warga.
      </p>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <form action={signIn} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            name="password"
            required
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition"
        >
          Masuk
        </button>
      </form>
    </>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm md:max-w-3xl">
        {/* Desktop: both boxes always expanded, side by side */}
        <div className="hidden md:grid md:grid-cols-2 gap-6 items-start">
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h1 className="text-lg font-semibold text-gray-900 mb-1">
              Bayar IPL
            </h1>
            {bayarIplBody}
          </div>
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h1 className="text-xl font-semibold text-gray-900 mb-1">
              Kiwari App
            </h1>
            {loginBody}
          </div>
        </div>

        {/* Mobile: accordion, collapsed by default */}
        <div className="md:hidden space-y-3">
          <details className="bg-white rounded-lg shadow-sm border border-gray-200">
            <summary className="cursor-pointer select-none px-6 py-4 text-lg font-semibold text-gray-900">
              Bayar IPL
            </summary>
            <div className="px-6 pb-6">{bayarIplBody}</div>
          </details>
          <details className="bg-white rounded-lg shadow-sm border border-gray-200">
            <summary className="cursor-pointer select-none px-6 py-4 text-xl font-semibold text-gray-900">
              Kiwari App
            </summary>
            <div className="px-6 pb-6">{loginBody}</div>
          </details>
        </div>
      </div>
    </div>
  );
}
