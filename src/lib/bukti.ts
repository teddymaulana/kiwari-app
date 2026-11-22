// Links to /api/bukti/[kind]/[id], which signs a fresh storage URL on each
// click (see that route for why pages no longer embed signed URLs).
export type BuktiKind =
  | "payment"
  | "expense"
  | "transfer"
  | "checkin"
  | "patrol"
  | "patrol-photo"
  | "alert";

export function buktiHref(kind: BuktiKind, id: string) {
  return `/api/bukti/${kind}/${id}`;
}
