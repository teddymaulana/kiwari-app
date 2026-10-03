import Image from "next/image";
import Link from "next/link";
import { signIn } from "./actions";
import BayarIplForm from "./BayarIplForm";
import SubmitButton from "@/components/SubmitButton";
import ClaimSuccessCard from "@/components/ClaimSuccessCard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Household, Settings } from "@/lib/types";
import { compareUnitNo } from "@/lib/types";
import { safeNextPath } from "@/lib/safeNext";

// The public Bayar IPL claim (./actions.ts, via createPendingPaymentClaim
// -> sendViaWablas) can wait up to TIMEOUT_MS (wablas.ts, currently 45s)
// for a slow Wablas reply while notifying 18G of the new claim — see the
// same comment on humas/page.tsx for why this is needed alongside that
// timeout.
export const maxDuration = 60;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    claim_error?: string;
    claim_success?: string;
    next?: string;
  }>;
}) {
  const {
    error,
    claim_error,
    claim_success,
    next: rawNext,
  } = await searchParams;
  // Set when the auth proxy bounced an anonymous visitor here from a
  // specific page — signIn sends them back to it (see safeNext.ts).
  const next = safeNextPath(rawNext);

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
      {claim_error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {claim_error}
        </div>
      )}

      {claim_success ? (
        <ClaimSuccessCard message={claim_success} resetHref="/login" />
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-5">
            Sudah transfer? Klaim pembayaran di sini, tanpa perlu login.
            Pengurus akan verifikasi sebelum tercatat Lunas.{" "}
            <Link
              href="/tutorial-bayar-ipl"
              className="text-blue-600 hover:underline whitespace-nowrap"
            >
              Lihat panduan &rarr;
            </Link>
          </p>

          <BayarIplForm
            households={households ?? []}
            defaultAmount={settings?.monthly_amount ?? 50000}
            year={new Date().getFullYear()}
          />
        </>
      )}
    </>
  );

  const loginBody = (
    <>
      <p className="text-sm text-gray-500 mb-6">
        {next
          ? "Login dulu untuk membuka halaman yang dituju."
          : "Masuk dengan email dan password akun warga."}
      </p>

      {error && (
        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <form action={signIn} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <SubmitButton
          pendingText="Masuk..."
          className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold shadow-sm hover:bg-blue-700 transition"
        >
          Masuk
        </SubmitButton>
      </form>
    </>
  );

  // Waste-management info — the page's headline CTA, deliberately louder
  // than the two utility cards below it.
  const sampahCta = (
    <Link
      href="/pengelolaan-sampah"
      className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-[#2f6b3f] via-[#24573a] to-[#1f4a2b] px-6 py-6 md:px-8 md:py-7 text-white shadow-lg shadow-[#1f4a2b]/25 ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#1f4a2b]/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f2b544]"
    >
      <div
        aria-hidden
        className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-[#3c7f4d] opacity-60"
      />
      <div
        aria-hidden
        className="absolute -bottom-24 right-24 h-40 w-40 rounded-full bg-[#f2b544] opacity-15"
      />
      {/* Big decorative leaf */}
      <svg
        aria-hidden
        className="absolute -right-4 -bottom-6 h-36 w-36 text-white/10 rotate-12 transition group-hover:rotate-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7"
        />
      </svg>
      <div className="relative md:flex md:items-center md:gap-6">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2b544] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-[#1f4a2b]">
            📢 Pemberitahuan Warga
          </span>
          <p className="mt-3 text-2xl md:text-[1.7rem] font-bold leading-tight text-balance">
            Pengelolaan Sampah di Kiwari
          </p>
          <p className="mt-1.5 text-[0.95rem] leading-relaxed text-[#dbe8dc] max-w-[44ch]">
            Mohon sampah dibungkus rapat &amp; dipilah basah/kering. Yuk cek
            kenapa ini penting untuk lingkungan kita!
          </p>
        </div>
        <span className="mt-4 md:mt-0 inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#1f4a2b] shadow-sm transition group-hover:gap-3">
          Baca selengkapnya
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </span>
      </div>
    </Link>
  );

  // Icon + title + one-line subtitle, shared by the desktop card headers
  // and the mobile accordion summaries.
  const cardHeader = (
    title: string,
    subtitle: string,
    iconPath: string,
    tone: "amber" | "blue",
  ) => (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          tone === "amber"
            ? "bg-amber-50 text-amber-600"
            : "bg-blue-50 text-blue-600"
        }`}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
  const walletIcon =
    "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z";
  const userIcon =
    "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z";
  const bayarIplHeader = cardHeader(
    "Bayar IPL",
    "Klaim iuran bulanan, tanpa login",
    walletIcon,
    "amber",
  );
  const loginHeader = cardHeader(
    "Login Warga",
    "Lihat laporan, jadwal keamanan & lainnya",
    userIcon,
    "blue",
  );
  const chevron = (
    <svg
      className="h-5 w-5 shrink-0 text-gray-400 transition group-open:rotate-180"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
  const cardClass = "bg-white rounded-2xl shadow-sm border border-gray-200";
  const summaryClass =
    "flex cursor-pointer select-none items-center gap-3 px-5 py-4 list-none [&::-webkit-details-marker]:hidden";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#eef6f1] via-gray-50 to-gray-50 px-4 py-8">
      <div className="w-full max-w-sm md:max-w-3xl">
        <Image
          src="/kiwari-logo-transparent.png"
          alt="Forum Warga Kiwari Residence"
          width={200}
          height={140}
          className="mx-auto mb-3 h-auto w-36"
          priority
        />
        <p className="text-center text-sm text-gray-500 mb-6">
          Selamat datang di aplikasi Forum Warga Kiwari Residence
        </p>

        <div className="mb-6">{sampahCta}</div>

        {/* Desktop: both boxes always expanded, side by side */}
        <div className="hidden md:grid md:grid-cols-2 gap-6 items-start">
          <div className={`${cardClass} p-7`}>
            <div className="mb-5">{bayarIplHeader}</div>
            {bayarIplBody}
          </div>
          <div className={`${cardClass} p-7`}>
            <div className="mb-5">{loginHeader}</div>
            {loginBody}
          </div>
        </div>

        {/* Mobile: accordion, collapsed by default */}
        <div className="md:hidden space-y-3">
          <details
            open={!!(claim_success || claim_error)}
            className={`group ${cardClass}`}
          >
            <summary className={summaryClass}>
              <div className="flex-1">{bayarIplHeader}</div>
              {chevron}
            </summary>
            <div className="px-5 pb-6 pt-1">{bayarIplBody}</div>
          </details>
          {/* Opened up front when they came here to reach a specific page
              (or just failed a login attempt), instead of collapsed. */}
          <details open={!!(next || error)} className={`group ${cardClass}`}>
            <summary className={summaryClass}>
              <div className="flex-1">{loginHeader}</div>
              {chevron}
            </summary>
            <div className="px-5 pb-6 pt-1">{loginBody}</div>
          </details>
        </div>
      </div>
    </div>
  );
}
