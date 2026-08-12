import { signIn } from "./actions";
import BayarIplForm from "./BayarIplForm";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Household, Settings } from "@/lib/types";

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
      .order("unit_no")
      .returns<Pick<Household, "id" | "unit_no" | "name">[]>(),
    admin.from("settings").select("*").eq("id", 1).single<Settings>(),
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm md:max-w-3xl grid md:grid-cols-2 gap-6 items-start">
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">
            Bayar IPL
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Sudah transfer? Klaim pembayaran di sini, tanpa perlu login.
            Pengurus akan verifikasi sebelum tercatat Lunas.
          </p>

          {claim_error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {claim_error}
            </div>
          )}
          {claim_success && (
            <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Klaim terkirim, menunggu verifikasi pengurus.
            </div>
          )}

          <BayarIplForm
            households={households ?? []}
            defaultAmount={settings?.monthly_amount ?? 50000}
          />
        </div>

        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">
            Kiwari App
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Login pengurus untuk mengelola iuran warga.
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

          <p className="text-xs text-gray-400 mt-6">
            Belum punya akun? Minta admin membuatkan akun lewat Supabase
            dashboard (Authentication → Users).
          </p>
        </div>
      </div>
    </div>
  );
}
