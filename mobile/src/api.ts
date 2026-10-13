import { File, UploadType } from "expo-file-system";

// Talks to the kiwari website's /api/security/* routes, never to Supabase
// directly — the database writes need the service-role key, which must
// stay on the server (an APK can be unpacked). Both values are baked in at
// build time; override API_URL with a local `next dev` while testing.
const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://kiwari-app.vercel.app";
// Must match SECURITY_APP_KEY on the website — gates /api/security/sync,
// which hands out guard PINs for offline login.
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY || "";

export type Guard = { id: string; name: string; pin: string };
export type ShiftType = "pagi" | "malam";
export type Shift = { shift_date: string; shift_type: ShiftType };
// An absen/patroli the server already has. rejected: pengurus rejected
// the check-in (it still blocks a resend for that shift).
export type Done = Shift & {
  kind: "checkin" | "patroli";
  guard_id: string;
  at: string;
  rejected: boolean;
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
};

export async function send(item: Submission) {
  const path = item.kind === "checkin" ? "/api/security/checkin" : "/api/security/patroli";
  const fields: Record<string, string> = {
    guard_id: item.guard_id,
    pin: item.pin,
    shift_date: item.shift_date,
    shift_type: item.shift_type,
    captured_at: item.captured_at,
  };
  if (item.report !== undefined) fields.report = item.report;

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
