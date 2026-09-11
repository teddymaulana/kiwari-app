import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveShiftCandidates } from "@/lib/securityActiveShift";
import PatrolForm from "./PatrolForm";
import ClaimSuccessCard from "@/components/ClaimSuccessCard";

// Public page — same treatment as /security/checkin: a guard opens this
// directly via a shared link, no login, admin client for the read-only
// guard list since there's no session for RLS.
export default async function SecurityPatroliPage({
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
            Laporan Patroli
          </h1>

          {error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          {success ? (
            <ClaimSuccessCard
              message="Laporan patroli Anda sudah terkirim."
              resetHref="/security/patroli"
            />
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-6">
                Pilih nama, masukkan PIN, lalu kirim laporan patroli untuk
                shift Anda (laporan dan foto opsional).
              </p>
              <PatrolForm
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
