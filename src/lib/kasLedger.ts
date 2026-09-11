import type { KasType } from "@/lib/types";
import { MONTH_NAMES } from "@/lib/types";

// One row of a kas ledger ("Mutasi Kas Tunai"/"Mutasi Kas BRI" on
// /mutasi) — a single real cash movement, bank-statement style. Built
// once per kas_type by buildKasLedgerRows below, from the same
// payments/contributions/expenses/cash_transfers/personnel_loans rows
// that feed the Kas Saat Ini total on /report (src/app/report/page.tsx)
// and getKasSaatIni (src/lib/kasSummary.ts) — keep all three in sync if
// the kas-balance formula changes.
export type KasLedgerRow = {
  date: string;
  created_at: string;
  description: string;
  kredit: number;
  debit: number;
};

type PaymentRow = {
  kas_type: string;
  paid_date: string;
  created_at: string;
  household_id: string;
  period_month: number;
  period_year: number;
  amount: number;
};

type ContributionRow = {
  kas_type: string;
  contribution_date: string;
  created_at: string;
  event_name: string;
  household_id: string | null;
  source_name: string | null;
  amount: number;
};

type ExpenseRow = {
  kas_type: string;
  expense_date: string;
  created_at: string;
  description: string;
  amount: number;
};

type TransferRow = {
  direction: string;
  transfer_date: string;
  created_at: string;
  note: string | null;
  amount: number;
};

type LoanRow = {
  kas_type: string;
  affects_kas: boolean;
  transaction_type: string;
  transaction_date: string;
  created_at: string;
  person_name: string;
  note: string | null;
  amount: number;
};

export function buildKasLedgerRows({
  kasType,
  payments,
  contributions,
  expenses,
  transfers,
  loans,
  householdNameMap,
  sortBy = "date",
}: {
  kasType: KasType;
  payments: PaymentRow[];
  contributions: ContributionRow[];
  expenses: ExpenseRow[];
  transfers: TransferRow[];
  loans: LoanRow[];
  householdNameMap: Map<string, string>;
  // "date" (default) orders by the actual transaction date — the usual
  // bank-statement order. "created_at" orders by when the row was
  // recorded in the app instead, for a kas whose entries tend to get
  // batch-entered out of transaction-date order (see Kas BRI on
  // /mutasi) — running Saldo accumulates in that same order either way,
  // so it stays internally consistent (each row's Saldo delta still
  // matches its own Kredit/Debit).
  sortBy?: "date" | "created_at";
}): KasLedgerRow[] {
  const rows: KasLedgerRow[] = [];

  payments
    .filter((p) => p.kas_type === kasType)
    .forEach((p) => {
      rows.push({
        date: p.paid_date,
        created_at: p.created_at,
        description: `IPL ${MONTH_NAMES[p.period_month - 1]} ${p.period_year} — ${
          householdNameMap.get(p.household_id) ?? p.household_id
        }`,
        kredit: Number(p.amount),
        debit: 0,
      });
    });

  contributions
    .filter((c) => c.kas_type === kasType)
    .forEach((c) => {
      const who = c.household_id
        ? householdNameMap.get(c.household_id) ?? c.household_id
        : c.source_name ?? "Lain-lain";
      rows.push({
        date: c.contribution_date,
        created_at: c.created_at,
        description: `${c.event_name} — ${who}`,
        kredit: Number(c.amount),
        debit: 0,
      });
    });

  expenses
    .filter((e) => e.kas_type === kasType)
    .forEach((e) => {
      rows.push({
        date: e.expense_date,
        created_at: e.created_at,
        description: e.description,
        kredit: 0,
        debit: Number(e.amount),
      });
    });

  // A transfer always touches both kas — which side is Kredit vs Debit
  // flips depending on which ledger we're building.
  transfers.forEach((t) => {
    const amount = Number(t.amount);
    const suffix = t.note ? ` — ${t.note}` : "";
    if (kasType === "tunai") {
      if (t.direction === "bri_to_tunai") {
        rows.push({
          date: t.transfer_date,
          created_at: t.created_at,
          description: `Tarik Tunai dari Kas BRI${suffix}`,
          kredit: amount,
          debit: 0,
        });
      } else {
        rows.push({
          date: t.transfer_date,
          created_at: t.created_at,
          description: `Setor Tunai ke Kas BRI${suffix}`,
          kredit: 0,
          debit: amount,
        });
      }
    } else {
      if (t.direction === "bri_to_tunai") {
        rows.push({
          date: t.transfer_date,
          created_at: t.created_at,
          description: `Tarik Tunai ke Petty Cash${suffix}`,
          kredit: 0,
          debit: amount,
        });
      } else {
        rows.push({
          date: t.transfer_date,
          created_at: t.created_at,
          description: `Setor Tunai dari Petty Cash${suffix}`,
          kredit: amount,
          debit: 0,
        });
      }
    }
  });

  loans
    .filter((l) => l.kas_type === kasType && l.affects_kas)
    .forEach((l) => {
      const amount = Number(l.amount);
      const suffix = l.note ? ` — ${l.note}` : "";
      if (l.transaction_type === "pinjam") {
        rows.push({
          date: l.transaction_date,
          created_at: l.created_at,
          description: `Pinjaman ke ${l.person_name}${suffix}`,
          kredit: 0,
          debit: amount,
        });
      } else {
        rows.push({
          date: l.transaction_date,
          created_at: l.created_at,
          description: `Pembayaran pinjaman — ${l.person_name}${suffix}`,
          kredit: amount,
          debit: 0,
        });
      }
    });

  rows.sort((a, b) => a[sortBy].localeCompare(b[sortBy]));
  return rows;
}

export type KasLedgerRowWithSaldo = KasLedgerRow & { saldo: number };

// Running Saldo computed oldest-first (the only order it's meaningful in),
// optionally offset by a constant (Petty Cash folds in the current
// Piutang Personel total — see mutasi/page.tsx) — then reversed so the
// table itself reads latest-first. The offset is a deliberate
// simplification: it's added uniformly to every row rather than
// reconstructed transaction-by-transaction, so older rows show today's
// receivable total rather than what was actually outstanding back then.
// Adjacent-row deltas still exactly match each row's own Kredit/Debit
// since a constant offset doesn't change consecutive differences — only
// the absolute figure on historical rows is approximate. Piutang's own
// history lives on /piutang; this just needs the latest (topmost) row to
// reconcile against the "Petty Cash" figure on /report.
export function withRunningSaldo(
  rows: KasLedgerRow[],
  openingBalance: number,
  constantOffset = 0
): KasLedgerRowWithSaldo[] {
  let running = openingBalance;
  const chronological = rows.map((row) => {
    running += row.kredit - row.debit;
    return { ...row, saldo: running + constantOffset };
  });
  return chronological.reverse();
}
