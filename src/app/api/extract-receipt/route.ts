import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Household } from "@/lib/types";

// Phone-camera receipt photos can be several thousand pixels wide — way
// more resolution than OCR needs for what's ultimately small print, and
// the extra pixels cost real recognition time on a serverless function's
// constrained CPU. Capping the longest edge (and dropping to grayscale,
// which also tends to help Tesseract's contrast-based text detection)
// cuts that cost without hurting legibility.
const MAX_OCR_DIMENSION = 1800;

export const runtime = "nodejs";
// OCR (language download on cold start + recognition) can run past the
// platform default — give it real headroom instead of hanging until an
// ungraceful kill.
export const maxDuration = 60;

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type MatchableHousehold = Pick<
  Household,
  "id" | "unit_no" | "name" | "alt_names"
>;

// A unit can have one registered head of household but several people who
// actually pay (e.g. spouse) — the bank receipt shows whoever sent it, not
// necessarily the registered name. Each candidate name is scored
// independently and the best one wins, so a match on alt_names alone is
// just as valid as a match on the primary name.
function nameCandidates(h: MatchableHousehold): string[] {
  const names = [h.name];
  if (h.alt_names) {
    names.push(
      ...h.alt_names
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
    );
  }
  return names;
}

// True if `needle`'s tokens appear consecutively, in order, inside
// `haystack` — a word-boundary-safe alternative to string.includes() that
// won't be fooled by e.g. "18" being a substring of "118".
function containsSubsequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((tok, j) => haystack[i + j] === tok)) return true;
  }
  return false;
}

function matchHousehold(
  ocrText: string,
  households: MatchableHousehold[]
): Pick<Household, "id" | "unit_no" | "name"> | null {
  const text = normalize(ocrText);
  const textTokenList = text.split(" ").filter(Boolean);
  const textTokens = new Set(textTokenList);

  // Name first: the more common case is a bank showing the sender's name.
  let best: { household: MatchableHousehold; score: number } | null = null;

  for (const h of households) {
    for (const candidate of nameCandidates(h)) {
      const words = normalize(candidate)
        .split(" ")
        .filter((w) => w.length >= 3);
      if (words.length === 0) continue;

      const matched = words.filter((w) => textTokens.has(w)).length;
      const score = matched / words.length;

      if (score > 0.5 && (!best || score > best.score)) {
        best = { household: h, score };
      }
    }
  }

  if (best) {
    const { id, unit_no, name } = best.household;
    return { id, unit_no, name };
  }

  // Fall back to unit number: some banks show no sender name at all, only
  // whatever note the sender typed — and warga sometimes write their unit
  // number there instead, in any of several forms ("18g", "18G", "18 g",
  // "18-g", ...). Hyphens/extra spaces already collapse to a single space
  // via normalize(), so a "18g"-style unit number just needs checking both
  // as one token and split into its digit/letter parts.
  //
  // OCR also frequently reads the letter "O" as the digit "0" (they look
  // alike) — no unit number in this system is purely numeric with a
  // trailing 0 (they're always digits-then-letter, e.g. "8O" not "80"), so
  // it's safe to treat "o"/"0" as the same character for this comparison.
  const oZeroCanon = (tok: string) => tok.replace(/o/g, "0");
  const canonicalTextTokens = textTokenList.map(oZeroCanon);

  for (const h of households) {
    const unitTokens = normalize(h.unit_no).split(" ").filter(Boolean);
    if (unitTokens.length === 0) continue;

    const variants = [unitTokens];
    const splitMatch =
      unitTokens.length === 1 ? unitTokens[0].match(/^(\d+)([a-z]+)$/) : null;
    if (splitMatch) variants.push([splitMatch[1], splitMatch[2]]);

    const unitMatches = variants.some((tokens) =>
      containsSubsequence(canonicalTextTokens, tokens.map(oZeroCanon))
    );

    if (unitMatches) return h;
  }

  return null;
}

// Picks a "Rp"/"IDR"-prefixed number from the OCR text. Indonesian bank
// apps format amounts with "." as thousands separator and "," as decimal
// (e.g. "Rp200.000,00") — receipts often also show the fee-inclusive total
// (e.g. "Rp502.500" = Rp500.000 transfer + Rp2.500 admin fee), so among
// several candidates a "round" one (last 4 digits zero, e.g. 500.000) is
// preferred over one that isn't, since IPL/kas amounts are always round
// and a non-round total is a strong signal it includes a fee. Falls back
// to the largest candidate if none are round.
function extractAmount(ocrText: string): number | null {
  const matches = ocrText.matchAll(/(?:rp|idr)\.?\s*([\d.,]{3,})/gi);
  const amounts: number[] = [];

  for (const m of matches) {
    const normalized = m[1].replace(/\./g, "").replace(/,\d{1,2}$/, "").replace(/,/g, "");
    const value = parseInt(normalized, 10);
    if (!isNaN(value) && value >= 1000 && value <= 1_000_000_000) {
      amounts.push(value);
    }
  }

  if (amounts.length === 0) return null;

  const round = amounts.filter((v) => v % 10000 === 0);
  const pool = round.length > 0 ? round : amounts;

  return Math.max(...pool);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File harus berupa gambar" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Ukuran file maksimal 8MB" }, { status: 400 });
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // Stage timings are logged (visible in Vercel's function logs) so a
  // slow/timed-out request is diagnosable from the logs alone instead of
  // guessing — this endpoint has hit Vercel's maxDuration in production
  // before with no way to tell which stage was the actual cost.
  const t0 = Date.now();
  const buffer = await sharp(rawBuffer)
    .rotate() // apply EXIF orientation before resizing, since phone photos often carry it
    .resize(MAX_OCR_DIMENSION, MAX_OCR_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .grayscale()
    .toBuffer();
  const t1 = Date.now();
  console.log(`[extract-receipt] preprocess: ${t1 - t0}ms`);

  // tesseract.js defaults to downloading its language data from a CDN on
  // every cold start (slow/unreliable enough on Vercel to blow past
  // maxDuration) and caching it in the current working directory, which
  // is read-only on Vercel outside of /tmp. Both problems go away by
  // pointing langPath at the copies bundled into the deployment (see
  // tessdata/ + next.config.ts outputFileTracingIncludes) and skipping
  // the cache entirely — cacheMethod "none" means it's read fresh off
  // local disk every time instead of touching any cache dir at all.
  const worker = await createWorker("ind+eng", 1, {
    langPath: path.join(process.cwd(), "tessdata"),
    cacheMethod: "none",
    gzip: false,
  });
  const t2 = Date.now();
  console.log(`[extract-receipt] worker init: ${t2 - t1}ms`);

  let text = "";
  try {
    const result = await worker.recognize(buffer);
    text = result.data.text;
    console.log(`[extract-receipt] recognize: ${Date.now() - t2}ms`);
  } finally {
    await worker.terminate();
  }

  const admin = createAdminClient();
  const { data: households } = await admin
    .from("households")
    .select("id, unit_no, name, alt_names")
    .eq("is_active", true)
    .returns<MatchableHousehold[]>();

  const match = matchHousehold(text, households ?? []);
  const amount = extractAmount(text);

  return NextResponse.json({ match, amount });
}
