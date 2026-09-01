import { MONTH_NAMES, formatRupiah } from "@/lib/types";

// Shared by the gateway send (payments/new/actions.ts confirmPaymentClaim)
// and the manual wa.me link (payments/new/page.tsx), so both ever say the
// same thing regardless of which one a given confirmation used.
export function paymentConfirmedMessage(
  unitNo: string,
  periodMonth: number,
  periodYear: number,
  amount: number
): string {
  return `✅ Halo, pembayaran IPL ${MONTH_NAMES[periodMonth - 1]} ${periodYear} untuk *${unitNo}* sebesar *${formatRupiah(amount)}* telah dikonfirmasi. Terima kasih! 🙏`;
}
