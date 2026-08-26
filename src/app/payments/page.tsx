import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, PAYMENT_DELETERS, CONTRIBUTION_DELETERS } from "@/lib/auth";
import { deletePayment, excludePayment, includePayment } from "./actions";
import {
  deleteContribution,
  excludeContribution,
  includeContribution,
} from "@/app/contributions/actions";
import DeletePaymentButton from "./DeletePaymentButton";
import ExcludeToggleButton from "@/components/ExcludeToggleButton";
import DeleteContributionButton from "@/app/contributions/DeleteContributionButton";
import HouseholdSelect from "@/components/HouseholdSelect";
import type { Household, Payment, Contribution } from "@/lib/types";
import { MONTH_NAMES, KAS_LABELS, formatRupiah, compareUnitNo } from "@/lib/types";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ household?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const { household: householdId } = await searchParams;

  const supabase = await createClient();
  const { data: households } = await supabase
    .from("households")
    .select("*")
    .returns<Household[]>();

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  const selected = households?.find((h) => h.id === householdId) ?? null;

  const [{ data: history }, { data: sumbangan }] = await Promise.all([
    householdId
      ? supabase
          .from("payments")
          .select("*")
          .eq("household_id", householdId)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .returns<Payment[]>()
      : Promise.resolve({ data: null as Payment[] | null }),
    householdId
      ? supabase
          .from("contributions")
          .select("*")
          .eq("household_id", householdId)
          .order("contribution_date", { ascending: false })
          .returns<Contribution[]>()
      : Promise.resolve({ data: null as Contribution[] | null }),
  ]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">
        Kelola Pembayaran
      </h1>
      <p className="text-xs text-gray-400 mb-6">
        Cari warga untuk melihat riwayat pembayaran IPL dan sumbangannya,
        lalu kecualikan/hapus entri yang salah dicatat (mis. klaim yang
        ternyata transfernya tidak masuk).
      </p>

      <form action="/payments" className="flex gap-2 items-start mb-8">
        <div className="flex-1">
          <HouseholdSelect
            households={households ?? []}
            name="household"
            value={householdId}
          />
        </div>
        <button
          type="submit"
          className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Lihat
        </button>
      </form>

      {selected && (
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-2">
            {selected.unit_no} - {selected.name}
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Periode</th>
                  <th className="px-4 py-2 font-medium">Jumlah</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Tanggal Bayar</th>
                  <th className="px-4 py-2 font-medium">Kas</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(history ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {MONTH_NAMES[p.period_month - 1]} {p.period_year}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {formatRupiah(Number(p.amount))}
                    </td>
                    <td className="px-4 py-2 space-x-1">
                      <span
                        className={
                          p.status === "confirmed"
                            ? "text-xs rounded-full bg-green-100 text-green-700 px-2 py-0.5"
                            : "text-xs rounded-full bg-yellow-100 text-yellow-700 px-2 py-0.5"
                        }
                      >
                        {p.status === "confirmed" ? "Lunas" : "Menunggu Verifikasi"}
                      </span>
                      {p.excluded && (
                        <span className="text-xs rounded-full bg-gray-100 text-gray-500 px-2 py-0.5">
                          Dikecualikan
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                      {new Date(p.paid_date).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                      {KAS_LABELS[p.kas_type]}
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      {PAYMENT_DELETERS.includes(user.email) && (
                        <>
                          <ExcludeToggleButton
                            action={(p.excluded ? includePayment : excludePayment).bind(
                              null,
                              p.id
                            )}
                            excluded={p.excluded}
                          />
                          <DeletePaymentButton
                            action={deletePayment.bind(null, p.id)}
                            description={`${MONTH_NAMES[p.period_month - 1]} ${p.period_year} - ${selected.unit_no}`}
                          />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {(history ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                      Belum ada riwayat pembayaran untuk warga ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-medium text-gray-700 mt-8 mb-2">
            Sumbangan
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Tanggal</th>
                  <th className="px-4 py-2 font-medium">Acara</th>
                  <th className="px-4 py-2 font-medium">Jumlah</th>
                  <th className="px-4 py-2 font-medium">Kas</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(sumbangan ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {new Date(c.contribution_date).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-2">
                      {c.event_name}
                      {c.excluded && (
                        <span className="ml-1 text-xs rounded-full bg-gray-100 text-gray-500 px-2 py-0.5">
                          Dikecualikan
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {formatRupiah(Number(c.amount))}
                    </td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                      {KAS_LABELS[c.kas_type]}
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      {CONTRIBUTION_DELETERS.includes(user.email) && (
                        <>
                          <ExcludeToggleButton
                            action={(c.excluded
                              ? includeContribution
                              : excludeContribution
                            ).bind(null, c.id)}
                            excluded={c.excluded}
                          />
                          <DeleteContributionButton
                            action={deleteContribution.bind(null, c.id)}
                            description={`${c.event_name} - ${selected.unit_no}`}
                          />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {(sumbangan ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                      Belum ada riwayat sumbangan untuk warga ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
