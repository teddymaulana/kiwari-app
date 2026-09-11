import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveShiftCandidates } from "@/lib/securityActiveShift";
import CheckinForm from "./CheckinForm";
import ClaimSuccessCard from "@/components/ClaimSuccessCard";

// Public page — a guard opens this directly (shared link), no login.
// Same treatment as /login's Bayar IPL box: read-only, non-sensitive
// fields fetched via the admin client since there's no session for RLS
// to key off of.
export default async function SecurityCheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

  const admin = createAdminClient();
  const { data: guards } = await admin
    .from("security_guards")
    .select("id, name")
    .eq("is_active", true)
    .order("name")
    .returns<{ id: string; name: string }[]>();

  const candidatesByGuard: Record<
    string,
    { shift_date: string; shift_type: "pagi" | "malam" }[]
  > = {};
  await Promise.all(
    (guards ?? []).map(async (g) => {
      candidatesByGuard[g.id] = await getActiveShiftCandidates(g.id);
    })
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <Image
          src="/kiwari-logo.png"
          alt="Forum Warga Kiwari Residence"
          width={200}
          height={140}
          className="mx-auto mb-6 h-auto w-40"
          priority
        />
        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">
            Absen Kehadiran
          </h1>

          {error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          {success ? (
            <ClaimSuccessCard
              message="Absen Anda sudah terkirim."
              resetHref="/security/checkin"
            />
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-6">
                Pilih nama, masukkan PIN, lalu unggah foto untuk absen shift
                Anda.
              </p>
              <CheckinForm
                guards={guards ?? []}
                candidatesByGuard={candidatesByGuard}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
