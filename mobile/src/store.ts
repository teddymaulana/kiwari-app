import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  fetchSyncData,
  MAX_PATROLS,
  OfflineError,
  type CheckinType,
  send,
  ServerError,
  type Done,
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

// A shift's window: Pagi 07.00–19.00, Malam 19.00–07.00 the next
// morning (so at 02.00 the current shift is yesterday's Malam).
const HOUR = 60 * 60 * 1000;

function shiftWindow({ shift_date, shift_type }: Shift): [number, number] {
  const [y, m, d] = shift_date.split("-").map(Number);
  const start = new Date(y, m - 1, d, shift_type === "pagi" ? 7 : 19).getTime();
  return [start, start + 12 * HOUR];
}

// The guard's shift happening now, from the cached schedule. Falls back
// to one starting or ending within the hour, so arriving at 06.45 or
// filing a patrol report at 19.20 still lands on the right shift. With
// nothing scheduled (e.g. swapped shifts with a colleague), it's whichever
// shift the clock is in — Pagi 07–19, else Malam (started yesterday if
// before 07.00) — marked offSchedule so the app can say so.
export type CurrentShift = Shift & { offSchedule?: boolean };

function shiftByClock(now: Date): CurrentShift {
  const h = now.getHours();
  const day = new Date(now);
  if (h < 7) day.setDate(day.getDate() - 1);
  const shift_date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
    day.getDate()
  ).padStart(2, "0")}`;
  return { shift_date, shift_type: h >= 7 && h < 19 ? "pagi" : "malam", offSchedule: true };
}

export function currentShift(data: SyncData, guardId: string, now = new Date()): CurrentShift {
  const t = now.getTime();
  const mine: Shift[] = data.shifts
    .filter((s) => s.guard_id === guardId && (s.shift_type === "pagi" || s.shift_type === "malam"))
    .map(({ shift_date, shift_type }) => ({ shift_date, shift_type }));
  const within = (grace: number) =>
    mine.find((s) => {
      const [start, end] = shiftWindow(s);
      return t >= start - grace && t < end + grace;
    });
  return within(0) ?? within(HOUR) ?? shiftByClock(now);
}

// Is this guard's absen masuk/pulang for the shift already done — on the
// server (per the last sync) or waiting in the queue?
export type Status =
  | { state: "done"; at: string }
  | { state: "rejected" }
  | { state: "waiting" }
  | null;

const sameShift = (a: Shift & { guard_id: string }, b: Shift & { guard_id: string }) =>
  a.guard_id === b.guard_id && a.shift_date === b.shift_date && a.shift_type === b.shift_type;

const typeOf = (x: { checkin_type?: CheckinType }) => x.checkin_type ?? "masuk";

export function checkinStatus(
  cache: SyncData | null,
  queue: QueueItem[],
  type: CheckinType,
  guardId: string,
  shift: Shift
): Status {
  const key = { ...shift, guard_id: guardId };
  const done = cache?.done?.find(
    (d) => d.kind === "checkin" && typeOf(d) === type && sameShift(d, key)
  );
  if (done) return done.rejected ? { state: "rejected" } : { state: "done", at: done.at };
  if (
    queue.some(
      (q) => !q.error && q.kind === "checkin" && typeOf(q) === type && sameShift(q, key)
    )
  ) {
    return { state: "waiting" };
  }
  return null;
}

// Tukar shift: which colleague this guard already said they're covering
// this shift (any absen/patrol sent or queued with it), so the choice
// survives logging out between absen and patrols.
export function shiftReplacement(
  cache: SyncData | null,
  queue: QueueItem[],
  guardId: string,
  shift: Shift
): string | null {
  const key = { ...shift, guard_id: guardId };
  const done = (cache?.done ?? []).find((d) => sameShift(d, key) && d.replaces_guard_id);
  if (done?.replaces_guard_id) return done.replaces_guard_id;
  return queue.find((q) => sameShift(q, key) && q.replaces_guard_id)?.replaces_guard_id ?? null;
}

// Status of Laporan Patroli 1, 2, 3 for this guard's shift: sent (per the
// last sync, or marked on delivery) or still waiting in the queue. Entries
// from before patrol slots existed are numbered by time.
export function patrolSlots(
  cache: SyncData | null,
  queue: QueueItem[],
  guardId: string,
  shift: Shift
): Status[] {
  const key = { ...shift, guard_id: guardId };
  const slots: Status[] = Array.from({ length: MAX_PATROLS }, () => null);
  (cache?.done ?? [])
    .filter((d) => d.kind === "patroli" && sameShift(d, key))
    .sort((a, b) => a.at.localeCompare(b.at))
    .forEach((d, i) => {
      const n = d.patrol_no ?? i + 1;
      if (n >= 1 && n <= MAX_PATROLS) slots[n - 1] = { state: "done", at: d.at };
    });
  queue
    .filter((q) => !q.error && q.kind === "patroli" && sameShift(q, key) && q.patrol_no)
    .forEach((q) => {
      const n = q.patrol_no!;
      if (n >= 1 && n <= MAX_PATROLS && !slots[n - 1]) slots[n - 1] = { state: "waiting" };
    });
  return slots;
}

// Records a delivered item in the cache straight away, so its status is
// right even if the follow-up sync doesn't get through.
function markDone(item: QueueItem) {
  const cache = loadCache();
  if (!cache) return;
  const entry: Done = {
    kind: item.kind,
    guard_id: item.guard_id,
    shift_date: item.shift_date,
    shift_type: item.shift_type,
    at: item.captured_at,
    rejected: false,
    ...(item.kind === "checkin"
      ? { checkin_type: typeOf(item) }
      : { client_id: item.id, patrol_no: item.patrol_no }),
  };
  const done = cache.done ?? [];
  const already =
    item.kind === "checkin"
      ? done.some((d) => d.kind === "checkin" && typeOf(d) === typeOf(item) && sameShift(d, entry))
      : done.some((d) => d.kind === "patroli" && d.client_id === item.id);
  if (already) return;
  writeJson(cacheFile, { ...cache, done: [...done, entry] });
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
// out in the next one. Resolves to the ids the server already had (an
// absen masuk/pulang already on file, or a patrol resend): dropped from
// the queue, since a resend can't succeed, but reported to the caller.
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
      markDone(item);
      discardItem(item);
    } catch (e) {
      if (e instanceof OfflineError) break;
      if (e instanceof ServerError && e.duplicate) {
        markDone(item);
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
