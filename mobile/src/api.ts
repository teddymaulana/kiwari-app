import { File, UploadType } from "expo-file-system";

// Talks to the kiwari website's /api/security/* routes, never to Supabase
// directly — the database writes need the service-role key, which must
// stay on the server (an APK can be unpacked). Both values are baked in at
// build time; override API_URL with a local `next dev` while testing.
const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://kiwari-app.vercel.app";
// Must match SECURITY_APP_KEY on the website — gates /api/security/sync,
// which hands out guard PINs for offline login.
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY || "";

// needs_patrol false = absen-only guard (no Laporan Patroli). Missing in
// caches from before the field existed = patrols.
export type Guard = { id: string; name: string; pin: string; needs_patrol?: boolean };
// Laporan Patroli 1, 2, 3 per shift.
export const MAX_PATROLS = 3;
export type ShiftType = "pagi" | "malam";
// Absen twice per shift: masuk at the start, pulang at the end.
export type CheckinType = "masuk" | "pulang";
export type Shift = { shift_date: string; shift_type: ShiftType };
// An absen/patroli the server already has. rejected: pengurus rejected
// the check-in (it still blocks a resend of that absen for the shift).
export type Done = Shift & {
  kind: "checkin" | "patroli";
  guard_id: string;
  at: string;
  rejected: boolean;
  // Absen only; missing in caches/servers from before masuk/pulang = masuk.
  checkin_type?: CheckinType;
  // Patroli only: the queue id it was sent with, and its slot (1–3).
  client_id?: string | null;
  patrol_no?: number;
};
export type SyncData = {
  guards: Guard[];
  shifts: (Shift & { guard_id: string })[];
  // Missing in caches saved before this field existed.
  done?: Done[];
};

// No connection at all — the caller keeps the item queued and retries.
export class OfflineError extends Error {}
// The server answered with an error. duplicate: the row already exists
// (usually an earlier send that got through but whose reply was lost).
export class ServerError extends Error {
  constructor(message: string, public duplicate = false) {
    super(message);
  }
}

function parseResponse<T>(status: number, text: string): T {
  let body: { error?: string; duplicate?: boolean } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON error page
  }
  if (status < 200 || status >= 300) {
    throw new ServerError(body?.error || `Gagal (${status})`, !!body?.duplicate);
  }
  return body as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, init);
  } catch {
    throw new OfflineError("Tidak ada koneksi internet");
  }
  return parseResponse<T>(res.status, await res.text().catch(() => ""));
}

export function fetchSyncData(): Promise<SyncData> {
  return request<SyncData>("/api/security/sync", { headers: { "x-app-key": APP_KEY } });
}

export type Submission = {
  kind: "checkin" | "patroli";
  guard_id: string;
  pin: string;
  shift_date: string;
  shift_type: ShiftType;
  report?: string;
  photoUri?: string;
  captured_at: string;
  checkin_type?: CheckinType;
  patrol_no?: number;
};

export async function send(item: Submission & { id: string }) {
  const path = item.kind === "checkin" ? "/api/security/checkin" : "/api/security/patroli";
  const fields: Record<string, string> = {
    guard_id: item.guard_id,
    pin: item.pin,
    shift_date: item.shift_date,
    shift_type: item.shift_type,
    captured_at: item.captured_at,
  };
  if (item.report !== undefined) fields.report = item.report;
  if (item.checkin_type) fields.checkin_type = item.checkin_type;
  // Lets the server spot a resend of a patrol it already saved.
  if (item.kind === "patroli") fields.client_id = item.id;
  if (item.patrol_no) fields.patrol_no = String(item.patrol_no);

  if (!item.photoUri) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    await request(path, { method: "POST", body: form });
    return;
  }

  // The photo goes through expo-file-system's native multipart upload:
  // the global fetch here is expo/fetch, which rejects React Native's
  // { uri, name, type } FormData parts.
  const photo = new File(item.photoUri);
  // Can't ever succeed, so reject it rather than retrying forever.
  if (!photo.exists) throw new ServerError("Foto tidak ditemukan di HP");
  let result;
  try {
    result = await photo.upload(API_URL + path, {
      uploadType: UploadType.MULTIPART,
      fieldName: "photo",
      mimeType: "image/jpeg",
      parameters: fields,
    });
  } catch {
    throw new OfflineError("Tidak ada koneksi internet");
  }
  parseResponse(result.status, result.body);
}

// Alert Sekuriti from residents (see /api/security/alerts on the website).
export type SecurityAlert = {
  id: string;
  message: string;
  unit_no: string | null;
  status: "open" | "acknowledged";
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  photo_url: string | null;
};

export async function fetchAlerts(): Promise<SecurityAlert[]> {
  const { alerts } = await request<{ alerts: SecurityAlert[] }>("/api/security/alerts", {
    headers: { "x-app-key": APP_KEY },
  });
  return alerts;
}

// Returns the name of the guard who already took it, if someone beat us.
export async function ackAlert(id: string, guard_id: string, pin: string): Promise<string | null> {
  const form = new FormData();
  form.append("guard_id", guard_id);
  form.append("pin", pin);
  const { already } = await request<{ already?: string | null }>(
    `/api/security/alerts/${id}/ack`,
    { method: "POST", headers: { "x-app-key": APP_KEY }, body: form }
  );
  return already ?? null;
}

export async function registerPushToken(token: string, device_name: string | null) {
  await request("/api/security/push-token", {
    method: "POST",
    headers: { "x-app-key": APP_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ token, device_name }),
  });
}
