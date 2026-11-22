import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, SECURITY_KEHADIRAN_ACCESS } from "@/lib/auth";
import { monthRange, photoArchiveName, type ArchivePhoto } from "@/lib/securityPhotos";

// Arsip Foto: lists one month's absen + patroli photos (?month=YYYY-MM)
// with short-lived signed URLs, so the Kehadiran page can zip them in the
// browser. Zipping here instead would hit Vercel's response-size limit
// (a month is ~75 MB). Photos already deleted from storage are skipped
// and counted. Same access as the Kehadiran page.

const SIGNED_URL_TTL_SECONDS = 30 * 60;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus" || !SECURITY_KEHADIRAN_ACCESS.includes(user.email)) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }
  const range = monthRange(request.nextUrl.searchParams.get("month") ?? "");
  if (!range) return NextResponse.json({ error: "Bulan tidak valid" }, { status: 400 });

  const supabase = await createClient();
  const [guardsRes, checkinsRes, patrolsRes] = await Promise.all([
    supabase.from("security_guards").select("id, name").returns<{ id: string; name: string }[]>(),
    supabase
      .from("security_checkins")
      .select("id, guard_id, shift_date, shift_type, checkin_type, status, checked_in_at, captured_at, photo_path")
      .gte("shift_date", range.from)
      .lte("shift_date", range.to)
      .returns<
        {
          id: string;
          guard_id: string;
          shift_date: string;
          shift_type: string;
          checkin_type: string | null;
          status: string;
          checked_in_at: string;
          captured_at: string | null;
          photo_path: string | null;
        }[]
      >(),
    supabase
      .from("security_patrols")
      .select("id, guard_id, shift_date, shift_type, patrol_no, submitted_at, captured_at, photo_path")
      .gte("shift_date", range.from)
      .lte("shift_date", range.to)
      .returns<
        {
          id: string;
          guard_id: string;
          shift_date: string;
          shift_type: string;
          patrol_no: number;
          submitted_at: string;
          captured_at: string | null;
          photo_path: string | null;
        }[]
      >(),
  ]);
  const failed = guardsRes.error ?? checkinsRes.error ?? patrolsRes.error;
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 });

  const nameOf = new Map((guardsRes.data ?? []).map((g) => [g.id, g.name]));

  // Laporan Patroli photos 2–5 of this month's patrols.
  const patrolById = new Map((patrolsRes.data ?? []).map((p) => [p.id, p]));
  const extra: { id: string; patrol_id: string; position: number; photo_path: string; captured_at: string | null }[] = [];
  const patrolIds = [...patrolById.keys()];
  for (let i = 0; i < patrolIds.length; i += 200) {
    const { data, error } = await supabase
      .from("security_patrol_photos")
      .select("id, patrol_id, position, photo_path, captured_at")
      .in("patrol_id", patrolIds.slice(i, i + 200))
      .returns<typeof extra>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    extra.push(...(data ?? []));
  }
  const items = [
    ...(checkinsRes.data ?? [])
      .filter((c) => c.photo_path)
      .map((c) => ({
        kind: "checkin" as const,
        id: c.id,
        path: c.photo_path!,
        name: photoArchiveName({
          shift_date: c.shift_date,
          at: c.captured_at ?? c.checked_in_at,
          shift_type: c.shift_type,
          guard: nameOf.get(c.guard_id) ?? "petugas",
          label: `Absen-${c.checkin_type === "pulang" ? "Pulang" : "Masuk"}${c.status === "rejected" ? "-DITOLAK" : ""}`,
          path: c.photo_path!,
        }),
      })),
    ...(patrolsRes.data ?? [])
      .filter((p) => p.photo_path)
      .map((p) => ({
        kind: "patrol" as const,
        id: p.id,
        path: p.photo_path!,
        name: photoArchiveName({
          shift_date: p.shift_date,
          at: p.captured_at ?? p.submitted_at,
          shift_type: p.shift_type,
          guard: nameOf.get(p.guard_id) ?? "petugas",
          label: `Patroli-${p.patrol_no}-Foto-1`,
          path: p.photo_path!,
        }),
      })),
    ...extra.map((ph) => {
      const p = patrolById.get(ph.patrol_id)!;
      return {
        kind: "patrol-photo" as const,
        id: ph.id,
        path: ph.photo_path,
        name: photoArchiveName({
          shift_date: p.shift_date,
          at: ph.captured_at ?? p.captured_at ?? p.submitted_at,
          shift_type: p.shift_type,
          guard: nameOf.get(p.guard_id) ?? "petugas",
          label: `Patroli-${p.patrol_no}-Foto-${ph.position}`,
          path: ph.photo_path,
        }),
      };
    }),
  ];

  const photos: ArchivePhoto[] = [];
  let missing = 0;
  if (items.length > 0) {
    const admin = createAdminClient();
    const { data: signed, error } = await admin.storage
      .from("bukti-kehadiran")
      .createSignedUrls(
        items.map((i) => i.path),
        SIGNED_URL_TTL_SECONDS
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    items.forEach((item, i) => {
      const s = signed?.[i];
      if (s?.signedUrl && !s.error) {
        photos.push({ kind: item.kind, id: item.id, name: item.name, url: s.signedUrl });
      } else {
        missing++;
      }
    });
  }
  photos.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ photos, missing });
}
