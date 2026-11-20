import { createAdminClient } from "@/lib/supabase/admin";

// Write path for a guard's Absen Kehadiran and Laporan Patroli, used by
// the Android app's JSON API (api/security/checkin, api/security/patroli).
// Returns an Indonesian error message for the caller to send back as JSON.

type ShiftType = "pagi" | "malam";
// duplicate: the unique (guard, shift) row already exists — for the app's
// offline queue that usually means an earlier send got through but its
// response was lost, so it can treat the item as delivered.
type Result = { error: string; duplicate?: boolean } | { error?: undefined; duplicate?: undefined };

// Phone-clock time the photo was taken / report written (see the
// captured_at comment in schema.sql). Optional and best-effort: anything
// unparseable is just dropped rather than failing the submission.
function parseCapturedAt(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type CheckinType = "masuk" | "pulang";

// Older app builds don't send checkin_type — their absen is the masuk one.
function parseCheckinType(value: string | undefined): CheckinType | null {
  if (!value) return "masuk";
  return value === "masuk" || value === "pulang" ? value : null;
}

export function isShiftType(value: string): value is ShiftType {
  return value === "pagi" || value === "malam";
}

// No login system for guards — guard_id + plaintext PIN, see the
// security_guards.pin comment in schema.sql.
export async function verifyGuard(
  guard_id: string,
  pin: string
): Promise<{ id: string; name: string } | null> {
  if (!guard_id || !pin) return null;
  const admin = createAdminClient();
  const { data: guard } = await admin
    .from("security_guards")
    .select("id, name, pin, is_active")
    .eq("id", guard_id)
    .maybeSingle<{ id: string; name: string; pin: string | null; is_active: boolean }>();
  if (!guard || !guard.is_active || !guard.pin || guard.pin !== pin) return null;
  return { id: guard.id, name: guard.name };
}

export async function saveCheckin(input: {
  guard_id: string;
  pin: string;
  shift_date: string;
  shift_type: string;
  photo: File | null;
  captured_at?: string;
  checkin_type?: string;
}): Promise<Result> {
  const { guard_id, pin, shift_date, shift_type, photo } = input;
  const checkin_type = parseCheckinType(input.checkin_type);
  if (!checkin_type) return { error: "Jenis absen tidak valid" };
  if (!guard_id || !pin) return { error: "Pilih nama dan isi PIN" };
  if (!shift_date || !isShiftType(shift_type)) return { error: "Shift tidak valid" };
  if (!photo || photo.size === 0) return { error: "Foto wajib diisi" };

  if (!(await verifyGuard(guard_id, pin))) return { error: "Nama atau PIN salah" };

  const admin = createAdminClient();
  const ext = photo.name.split(".").pop() || "jpg";
  const path = `checkin/${guard_id}/${Date.now()}-${checkin_type}-${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("bukti-kehadiran")
    .upload(path, photo, { contentType: photo.type });
  if (uploadError) return { error: "Gagal mengunggah foto: " + uploadError.message };

  const { error } = await admin.from("security_checkins").insert({
    guard_id,
    shift_date,
    shift_type,
    photo_path: path,
    captured_at: parseCapturedAt(input.captured_at),
    checkin_type,
  });
  if (error) {
    await admin.storage.from("bukti-kehadiran").remove([path]);
    if (error.code === "23505") {
      return {
        error: `Sudah pernah absen ${checkin_type} untuk shift ini`,
        duplicate: true,
      };
    }
    return { error: error.message };
  }
  return {};
}

export async function savePatrol(input: {
  guard_id: string;
  pin: string;
  shift_date: string;
  shift_type: string;
  report: string;
  photo: File | null;
  captured_at?: string;
  client_id?: string;
}): Promise<Result> {
  const { guard_id, pin, shift_date, shift_type, report, photo } = input;
  // Any number of patrols per shift. client_id is the app's queue id: the
  // same id arriving twice is a resend whose first reply was lost.
  const client_id = input.client_id?.slice(0, 100) || null;
  if (!guard_id || !pin) return { error: "Pilih nama dan isi PIN" };
  if (!shift_date || !isShiftType(shift_type)) return { error: "Shift tidak valid" };

  if (!(await verifyGuard(guard_id, pin))) return { error: "Nama atau PIN salah" };

  const admin = createAdminClient();
  // Photo is optional for a patrol report, so a failed upload just drops
  // it rather than failing the whole submission.
  let photo_path: string | null = null;
  if (photo && photo.size > 0) {
    const ext = photo.name.split(".").pop() || "jpg";
    const path = `patrol/${guard_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("bukti-kehadiran")
      .upload(path, photo, { contentType: photo.type });
    if (!uploadError) photo_path = path;
  }

  const { error } = await admin.from("security_patrols").insert({
    guard_id,
    shift_date,
    shift_type,
    report,
    photo_path,
    captured_at: parseCapturedAt(input.captured_at),
    client_id,
  });
  if (error) {
    if (photo_path) await admin.storage.from("bukti-kehadiran").remove([photo_path]);
    if (error.code === "23505") {
      return { error: "Laporan patroli ini sudah terkirim", duplicate: true };
    }
    return { error: error.message };
  }
  return {};
}
