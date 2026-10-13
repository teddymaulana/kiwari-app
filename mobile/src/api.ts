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
export type SyncData = { guards: Guard[]; shifts: (Shift & { guard_id: string })[] };

// No connection at all — the caller keeps the item queued and retries.
export class OfflineError extends Error {}
// The server answered with an error. duplicate: the row already exists
// (usually an earlier send that got through but whose reply was lost).
export class ServerError extends Error {
  constructor(message: string, public duplicate = false) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, init);
  } catch {
    throw new OfflineError("Tidak ada koneksi internet");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ServerError(body?.error || `Gagal (${res.status})`, !!body?.duplicate);
  return body as T;
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
  const form = new FormData();
  form.append("guard_id", item.guard_id);
  form.append("pin", item.pin);
  form.append("shift_date", item.shift_date);
  form.append("shift_type", item.shift_type);
  form.append("captured_at", item.captured_at);
  if (item.report !== undefined) form.append("report", item.report);
  if (item.photoUri) {
    // React Native's FormData takes a { uri, name, type } object for files.
    form.append("photo", {
      uri: item.photoUri,
      name: "foto.jpg",
      type: "image/jpeg",
    } as unknown as Blob);
  }
  await request(item.kind === "checkin" ? "/api/security/checkin" : "/api/security/patroli", {
    method: "POST",
    body: form,
  });
}
