export type Household = {
  id: string;
  unit_no: string;
  name: string;
  phone: string | null;
  alt_names: string | null;
  is_active: boolean;
  created_at: string;
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
  created_at: string;
};

export type Expense = {
  id: string;
  expense_date: string;
  description: string;
  amount: number;
  recorded_by: string | null;
  created_at: string;
};

export type Settings = {
  id: number;
  monthly_amount: number;
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

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
