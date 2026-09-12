import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Settings } from "@/lib/types";
import { formatRupiah } from "@/lib/types";
import {
  buildKasLedgerRows,
  withRunningSaldo,
  type KasLedgerRowWithSaldo,
} from "@/lib/kasLedger";
import MutasiTabs from "./MutasiTabs";

function LedgerTable({
  rows,
  openingBalance,
  note,
}: {
  rows: KasLedgerRowWithSaldo[];
  openingBalance: number;
  note?: string;
}) {
  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Tanggal</th>
              <th className="px-3 py-2 font-medium">Keterangan</th>
              <th className="px-3 py-2 font-medium text-right">Kredit</th>
              <th className="px-3 py-2 font-medium text-right">Debit</th>
              <th className="px-3 py-2 font-medium text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                  {new Date(row.date).toLocaleDateString("id-ID")}
                </td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2 text-right text-emerald-600 whitespace-nowrap">
                  {row.kredit > 0 ? (
                    formatRupiah(row.kredit)
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-red-600 whitespace-nowrap">
                  {row.debit > 0 ? (
                    formatRupiah(row.debit)
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td
                  className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                    row.saldo < 0 ? "text-red-600" : "text-gray-900"
                  }`}
                >
                  {formatRupiah(row.saldo)}
                </td>
              </tr>
            ))}
            {/* Oldest row, so it sits last under latest-first order. */}
            <tr className="bg-gray-50">
              <td className="px-3 py-2 text-gray-300">—</td>
              <td className="px-3 py-2 font-medium text-gray-700">Saldo Awal</td>
              <td className="px-3 py-2 text-right text-gray-300">—</td>
              <td className="px-3 py-2 text-right text-gray-300">—</td>
              <td className="px-3 py-2 text-right font-medium text-gray-900">
                {formatRupiah(openingBalance)}
              </td>
            </tr>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  Belum ada mutasi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-2 text-xs text-gray-400">{note}</p>}
    </div>
  );
}

export default async function MutasiPage() {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/report");

  const supabase = await createClient();

  const [
    { data: payments },
    { data: contributions },
    { data: expenses },
    { data: transfers },
    { data: loans },
    { data: settings },
    { data: households },
  ] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "amount, kas_type, paid_date, created_at, household_id, period_month, period_year"
      )
      .eq("status", "confirmed")
      .eq("excluded", false),
    supabase
      .from("contributions")
      .select(
        "amount, kas_type, contribution_date, created_at, event_name, household_id, source_name"
      )
      .eq("excluded", false),
    supabase
      .from("expenses")
      .select("amount, kas_type, expense_date, created_at, description"),
    supabase
      .from("cash_transfers")
      .select("amount, direction, transfer_date, created_at, note"),
    supabase
      .from("personnel_loans")
      .select(
        "amount, kas_type, transaction_type, affects_kas, transaction_date, created_at, person_name, note"
      ),
    supabase.from("settings").select("*").eq("id", 1).single<Settings>(),
    // Unfiltered by is_active — a household that's since moved out should
    // still get a name on its historical rows instead of a raw id.
    supabase.from("households").select("id, unit_no, name"),
  ]);

  const householdNameMap = new Map<string, string>(
    (households ?? []).map((h) => [
      h.id,
      h.name ? `${h.unit_no} - ${h.name}` : h.unit_no,
    ])
  );

  // Same accumulation as report/page.tsx's piutangPersonel — every
  // personnel loan regardless of kas_type/affects_kas, since the
  // receivable isn't tied to a specific kas.
  let piutangPersonel = 0;
  (loans ?? []).forEach((l) => {
    const amount = Number(l.amount);
    if (l.transaction_type === "pinjam") piutangPersonel += amount;
    else piutangPersonel -= amount;
  });

  const commonArgs = {
    payments: payments ?? [],
    contributions: contributions ?? [],
    expenses: expenses ?? [],
    transfers: transfers ?? [],
    loans: loans ?? [],
    householdNameMap,
  };

  const openingTunai = Number(settings?.opening_balance_tunai ?? 0);
  const openingBri = Number(settings?.opening_balance_bri ?? 0);

  const tunaiRows = buildKasLedgerRows({ kasType: "tunai", ...commonArgs });
  const briRows = buildKasLedgerRows({ kasType: "bri", ...commonArgs });

  // Petty Cash's Saldo here matches the "Petty Cash" figure on /report
  // exactly (kasBalance.tunai + piutangPersonel) — Kas BRI doesn't fold
  // in the receivable since it's only ever attributed to Petty Cash there.
  const tunaiLedger = withRunningSaldo(tunaiRows, openingTunai, piutangPersonel);
  const briLedger = withRunningSaldo(briRows, openingBri);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-1">Mutasi Kas</h1>
      <p className="text-sm text-gray-500 mb-6">
        Riwayat pergerakan kas, seperti mutasi rekening bank — Kredit
        (masuk), Debit (keluar), dan Saldo berjalan. Sama seperti Kas Saat
        Ini di Laporan.
      </p>

      <MutasiTabs
        pettyCashTable={
          <LedgerTable
            rows={tunaiLedger}
            openingBalance={openingTunai + piutangPersonel}
            note={`Saldo di atas sudah termasuk Piutang Personel yang belum dibayar (${formatRupiah(
              piutangPersonel
            )}) — lihat rincian di /piutang.`}
          />
        }
        briTable={<LedgerTable rows={briLedger} openingBalance={openingBri} />}
      />
    </div>
  );
}
