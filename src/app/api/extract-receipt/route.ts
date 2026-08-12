import { NextRequest, NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Household } from "@/lib/types";

export const runtime = "nodejs";

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

function matchHousehold(
  ocrText: string,
  households: MatchableHousehold[]
): Pick<Household, "id" | "unit_no" | "name"> | null {
  const text = normalize(ocrText);
  const textTokens = new Set(text.split(" ").filter(Boolean));

  // Name first: the more common case is a bank showing the sender's name.
  let best: { household: MatchableHousehold; score: number } | null = null;

  for (const h of households) {
    for (const candidate of nameCandidates(h)) {
      const words = normalize(candidate)
        .split(" ")
        .filter((w) => w.length >= 3);
      if (words.length === 0) continue;

      const matched = words.filter((w) => text.includes(w)).length;
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
  // number there instead. A whole-token match (e.g. "18g") is precise
  // enough to trust on its own.
  for (const h of households) {
    const unitTokens = normalize(h.unit_no).split(" ").filter(Boolean);
    if (unitTokens.length === 0) continue;

    const unitMatches =
      unitTokens.length === 1
        ? textTokens.has(unitTokens[0])
        : text.includes(unitTokens.join(" "));

    if (unitMatches) return h;
  }

  return null;
}

// Picks the largest "Rp"/"IDR"-prefixed number in the OCR text. Indonesian
// bank apps format amounts with "." as thousands separator and "," as
// decimal (e.g. "Rp200.000,00") — receipts often also show a smaller admin
// fee, so "largest Rp-prefixed number" is a simple heuristic for picking
// the actual transfer amount over the fee.
function extractAmount(ocrText: string): number | null {
  const matches = ocrText.matchAll(/(?:rp|idr)\.?\s*([\d.,]{3,})/gi);
  let best: number | null = null;

  for (const m of matches) {
    const normalized = m[1].replace(/\./g, "").replace(/,\d{1,2}$/, "").replace(/,/g, "");
    const value = parseInt(normalized, 10);
    if (!isNaN(value) && value >= 1000 && value <= 1_000_000_000) {
      if (best === null || value > best) best = value;
    }
  }

  return best;
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

  const buffer = Buffer.from(await file.arrayBuffer());

  const worker = await createWorker("ind+eng");
  let text = "";
  try {
    const result = await worker.recognize(buffer);
    text = result.data.text;
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
