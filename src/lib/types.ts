export type Household = {
  id: string;
  unit_no: string;
  name: string;
  phone: string | null;
  phone_pasangan: string | null;
  alt_names: string | null;
  is_active: boolean;
  created_at: string;
};

export type KasType = "tunai" | "bri";

export const KAS_LABELS: Record<KasType, string> = {
  tunai: "Petty Cash",
  bri: "Kas BRI",
};

export type Payment = {
  id: string;
  household_id: string;
  period_year: number;
  period_month: number;
  amount: number;
  paid_date: string;
  note: string | null;
  recorded_by: string | null;
  status: "pending" | "confirmed";
  receipt_path: string | null;
  kas_type: KasType;
  created_at: string;
};

// Other income from residents beyond the recurring monthly IPL — one-off
// contributions tied to a specific event (e.g. "Sumbangan Agustus 2026").
// Either household_id or source_name is set — household_id for a resident,
// source_name for a contribution from outside any household (e.g.
// "Sumbangan Developer").
export type Contribution = {
  id: string;
  household_id: string | null;
  source_name: string | null;
  event_name: string;
  amount: number;
  contribution_date: string;
  note: string | null;
  recorded_by: string | null;
  kas_type: KasType;
  created_at: string;
};

export type Expense = {
  id: string;
  expense_date: string;
  description: string;
  amount: number;
  recorded_by: string | null;
  kas_type: KasType;
  status: "draft" | "released";
  receipt_path: string | null;
  created_at: string;
};

export const EXPENSE_STATUS_LABELS: Record<Expense["status"], string> = {
  draft: "Draft",
  released: "Dirilis",
};

// direction 'bri_to_tunai' = cash withdrawn from bank BRI into petty cash;
// 'tunai_to_bri' = petty cash deposited back into the bank.
export type CashTransfer = {
  id: string;
  transfer_date: string;
  amount: number;
  direction: "bri_to_tunai" | "tunai_to_bri";
  note: string | null;
  recorded_by: string | null;
  created_at: string;
};

// Loans (hutang) the kas has extended to personnel, and their
// repayments — 'pinjam' increases what they owe, 'bayar' reduces it.
export type PersonnelLoan = {
  id: string;
  person_name: string;
  amount: number;
  transaction_type: "pinjam" | "bayar";
  transaction_date: string;
  kas_type: KasType;
  // false only for a backfilled loan that predates this app's tracking —
  // the cash already left the kas before any opening balance/expense was
  // recorded here, so it's excluded from the Kas Tunai/BRI calculation to
  // avoid double-subtracting it.
  affects_kas: boolean;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
};

export type Settings = {
  id: number;
  monthly_amount: number;
  opening_balance_bri: number;
  opening_balance_tunai: number;
  updated_at: string;
};

export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// Sorts unit_no by its numeric block first (8, 9, 18, 19, ...) then its
// letter suffix (A, B, ...) — plain text order would put "18A" before "8A".
function unitSortKey(unitNo: string): [number, string] {
  const m = unitNo.match(/^(\d+)([A-Za-z]*)$/);
  if (!m) return [Number.MAX_SAFE_INTEGER, unitNo];
  return [parseInt(m[1], 10), m[2]];
}

export function compareUnitNo(a: string, b: string): number {
  const [aNum, aSuffix] = unitSortKey(a);
  const [bNum, bSuffix] = unitSortKey(b);
  return aNum - bNum || aSuffix.localeCompare(bSuffix);
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
