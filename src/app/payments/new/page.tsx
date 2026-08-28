import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, PAYMENT_RECORDERS, PAYMENT_VERIFIERS } from "@/lib/auth";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { buildWaMeUrl } from "@/lib/waMe";
import { paymentConfirmedMessage } from "@/lib/paymentMessages";
import { confirmPaymentClaim, confirmPaymentClaimManual, rejectPaymentClaim } from "./actions";
import RecordPaymentForm from "./RecordPaymentForm";
import SubmitButton from "@/components/SubmitButton";
import OpenWaMeButton from "@/components/OpenWaMeButton";
import type { Household, Payment, Settings } from "@/lib/types";
import { MONTH_NAMES, formatRupiah, compareUnitNo } from "@/lib/types";

type PendingClaim = Payment & {
  households: Pick<Household, "unit_no" | "name" | "phone" | "phone_pasangan"> | null;
};

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: households }, { data: settings }, { data: pendingClaims }, provider] =
    await Promise.all([
      supabase
        .from("households")
        .select("*")
        .eq("is_active", true)
        .returns<Household[]>(),
      supabase.from("settings").select("*").eq("id", 1).single<Settings>(),
      supabase
        .from("payments")
        .select("*, households(unit_no, name, phone, phone_pasangan)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .returns<PendingClaim[]>(),
      getWhatsAppProvider(),
    ]);

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  const admin = createAdminClient();
  const receiptUrls = new Map<string, string>();
  await Promise.all(
    (pendingClaims ?? [])
      .filter((c) => c.receipt_path)
      .map(async (c) => {
        const { data } = await admin.storage
          .from("bukti-transfer")
          .createSignedUrl(c.receipt_path!, 60 * 10);
        if (data?.signedUrl) receiptUrls.set(c.id, data.signedUrl);
      })
  );

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

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-medium text-gray-700">
            Verifikasi Pembayaran
          </h2>
          {(pendingClaims ?? []).length > 0 && (
            <span className="inline-block rounded-full bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5">
              {(pendingClaims ?? []).length} menunggu
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Klaim yang dikirim warga lewat form &quot;Bayar IPL&quot; di
          halaman login, tanpa perlu akun. Belum terhitung Lunas sampai
          dikonfirmasi.
        </p>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {(pendingClaims ?? []).map((c) => (
            <div
              key={c.id}
              className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="text-sm">
                <p className="font-medium text-gray-900">
                  {c.households?.unit_no} - {c.households?.name}
                </p>
                <p className="text-xs text-gray-500">
                  {MONTH_NAMES[c.period_month - 1]} {c.period_year} —{" "}
                  {formatRupiah(Number(c.amount))}
                  {c.note && ` — ${c.note}`}
                </p>
              </div>
              <div className="flex gap-2">
                {receiptUrls.has(c.id) && (
                  <a
                    href={receiptUrls.get(c.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-gray-600 border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50 transition"
                  >
                    Lihat Bukti
                  </a>
                )}
                {PAYMENT_VERIFIERS.includes(user.email) && (
                  <>
                    {provider === "manual" ? (
                      <OpenWaMeButton
                        urls={[c.households?.phone, c.households?.phone_pasangan]
                          .filter((p): p is string => !!p)
                          .map((phone) =>
                            buildWaMeUrl(
                              phone,
                              paymentConfirmedMessage(
                                c.households!.unit_no,
                                c.period_month,
                                c.period_year,
                                Number(c.amount)
                              )
                            )
                          )}
                        action={confirmPaymentClaimManual.bind(null, c.id)}
                        label="Konfirmasi"
                        pendingLabel="Memproses..."
                        className="text-xs bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700 transition"
                      />
                    ) : (
                      <form action={confirmPaymentClaim.bind(null, c.id)}>
                        <SubmitButton
                          pendingText="Memproses..."
                          className="text-xs bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700 transition"
                        >
                          Konfirmasi
                        </SubmitButton>
                      </form>
                    )}
                    <form action={rejectPaymentClaim.bind(null, c.id)}>
                      <SubmitButton
                        pendingText="Memproses..."
                        className="text-xs text-red-600 border border-red-200 rounded px-3 py-1.5 hover:bg-red-50 transition"
                      >
                        Tolak
                      </SubmitButton>
                    </form>
                  </>
                )}
              </div>
            </div>
          ))}
          {(pendingClaims ?? []).length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-xs">
              Tidak ada klaim menunggu verifikasi.
            </div>
          )}
        </div>
      </div>

      {PAYMENT_RECORDERS.includes(user.email) && (
        <RecordPaymentForm
          households={households ?? []}
          defaultAmount={settings?.monthly_amount ?? 50000}
        />
      )}
    </div>
  );
}
