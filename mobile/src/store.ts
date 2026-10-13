import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  fetchSyncData,
  OfflineError,
  send,
  ServerError,
  type Shift,
  type Submission,
  type SyncData,
} from "./api";

// Everything the app needs to work without signal, kept as JSON files in
// the app's private storage:
// - cache.json: guards (with PINs) + upcoming shifts, refreshed from
//   /api/security/sync whenever the phone is online.
// - queue.json + photos/: submissions not yet delivered. Each is sent as
//   soon as possible and removed once the server has it.

const cacheFile = new File(Paths.document, "cache.json");
const queueFile = new File(Paths.document, "queue.json");
const photosDir = new Directory(Paths.document, "photos");

export type QueueItem = Submission & {
  id: string;
  guard_name: string;
  // Set when the server rejected it (e.g. PIN changed since the cache was
  // synced) — kept so it's visible on the phone instead of silently lost.
  error?: string;
};

function readJson<T>(file: File, fallback: T): T {
  try {
    return file.exists ? (JSON.parse(file.textSync()) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file: File, value: unknown) {
  file.write(JSON.stringify(value));
}

export function loadCache(): SyncData | null {
  return readJson<SyncData | null>(cacheFile, null);
}

// Returns the fresh data, or null if offline / rejected (the old cache
// stays in place either way).
export async function refreshCache(): Promise<SyncData | null> {
  try {
    const data = await fetchSyncData();
    writeJson(cacheFile, data);
    return data;
  } catch {
    return null;
  }
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Same candidates the website offers (lib/securityActiveShift.ts): the
// guard's Pagi/Malam shifts dated today or yesterday (an overnight Malam
// is still active through the early morning), newest first.
export function shiftCandidates(data: SyncData, guardId: string, now = new Date()): Shift[] {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const dates = [toDateStr(now), toDateStr(yesterday)];
  return data.shifts
    .filter((s) => s.guard_id === guardId && dates.includes(s.shift_date))
    .map(({ shift_date, shift_type }) => ({ shift_date, shift_type }))
    .sort((a, b) => (a.shift_date < b.shift_date ? 1 : -1));
}

export function loadQueue(): QueueItem[] {
  return readJson<QueueItem[]>(queueFile, []);
}

// Removes an item and its photo — once delivered, or when the guard/
// pengurus deletes a rejected one from the list.
export function discardItem(item: QueueItem) {
  writeJson(queueFile, loadQueue().filter((q) => q.id !== item.id));
  if (item.photoUri) {
    try {
      new File(item.photoUri).delete();
    } catch {
      // already gone
    }
  }
}

// Shrinks the camera photo (several MB) and moves it into permanent
// storage — the picker's own file lives in a cache folder Android may
// clear before a queued item gets sent.
async function storePhoto(uri: string, id: string): Promise<string> {
  const image = await ImageManipulator.manipulate(uri)
    .resize({ width: 1280, height: null })
    .renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  photosDir.create({ idempotent: true, intermediates: true });
  const dest = new File(photosDir, `${id}.jpg`);
  await new File(saved.uri).copy(dest);
  return dest.uri;
}

export async function enqueue(
  submission: Submission & { guard_name: string }
): Promise<QueueItem> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: QueueItem = {
    ...submission,
    id,
    photoUri: submission.photoUri ? await storePhoto(submission.photoUri, id) : undefined,
  };
  writeJson(queueFile, [...loadQueue(), item]);
  return item;
}

// Sends every queued item that hasn't been rejected yet. Stops at the
// first connection failure (no point trying the rest). Flushes run one
// after another, each re-reading the queue — so a timer flush and a fresh
// submission can't double-send, and an item added mid-flush still goes
// out in the next one. Resolves to the ids the server already had (one
// absen/patroli per guard per shift): dropped from the queue, since a
// resend can't succeed, but reported so the guard isn't told "Terkirim".
let chain: Promise<unknown> = Promise.resolve();

export function flushQueue(): Promise<string[]> {
  const run = chain.then(flushOnce);
  chain = run.catch(() => {});
  return run;
}

async function flushOnce(): Promise<string[]> {
  const duplicates: string[] = [];
  for (const item of loadQueue()) {
    if (item.error) continue;
    try {
      await send(item);
      discardItem(item);
    } catch (e) {
      if (e instanceof OfflineError) break;
      if (e instanceof ServerError && e.duplicate) {
        discardItem(item);
        duplicates.push(item.id);
        continue;
      }
      writeJson(
        queueFile,
        loadQueue().map((q) => (q.id === item.id ? { ...q, error: (e as Error).message } : q))
      );
    }
  }
  return duplicates;
}
