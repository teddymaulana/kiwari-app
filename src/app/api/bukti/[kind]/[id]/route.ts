import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, SECURITY_KEHADIRAN_ACCESS } from "@/lib/auth";
import type { BuktiKind } from "@/lib/bukti";

// Signs a storage link at click time and redirects to it. Pages used to
// sign these links at render time with a 10-minute expiry, so a page left
// open longer than that gave Supabase's "InvalidJWT: exp claim timestamp
// check failed" when someone clicked "Lihat Bukti". Linking here instead
// means the URL in the page never expires; only the redirect target does.
//
// The client only passes a row id: the storage path comes from the table,
// so this can't be used to read arbitrary objects from these buckets.
const KINDS: Record<BuktiKind, { table: string; column: string; bucket: string }> = {
  payment: { table: "payments", column: "receipt_path", bucket: "bukti-transfer" },
  expense: { table: "expenses", column: "receipt_path", bucket: "bukti-pengeluaran" },
  transfer: { table: "cash_transfers", column: "receipt_path", bucket: "bukti-transfer-kas" },
  checkin: { table: "security_checkins", column: "photo_path", bucket: "bukti-kehadiran" },
  patrol: { table: "security_patrols", column: "photo_path", bucket: "bukti-kehadiran" },
  alert: { table: "security_alerts", column: "photo_path", bucket: "bukti-kehadiran" },
};

// Short: the link is used immediately by the redirect.
const SIGNED_URL_TTL_SECONDS = 60;

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/bukti/[kind]/[id]">
) {
  const { kind, id } = await ctx.params;
  if (!Object.hasOwn(KINDS, kind)) {
    return NextResponse.json({ error: "Jenis bukti tidak dikenal" }, { status: 404 });
  }
  const { table, column, bucket } = KINDS[kind as BuktiKind];

  // Same gates as the pages that show these links.
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }
  if (
    (kind === "checkin" || kind === "patrol") &&
    !SECURITY_KEHADIRAN_ACCESS.includes(user.email)
  ) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from(table)
    .select(column)
    .eq("id", id)
    .maybeSingle<Record<string, string | null>>();
  const path = row?.[column];
  if (!path) {
    return NextResponse.json({ error: "Bukti tidak ditemukan" }, { status: 404 });
  }

  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    // Absen/patroli photos are deleted from storage after a month is
    // downloaded as ZIP (Arsip Foto on /security/kehadiran).
    if (kind === "checkin" || kind === "patrol") {
      return new NextResponse(
        "Foto ini sudah diarsipkan: diunduh lewat Arsip Foto (ZIP per bulan) lalu dihapus dari server. Buka file ZIP bulan tersebut untuk melihatnya.",
        { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
    return NextResponse.json({ error: "Gagal membuka bukti" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
