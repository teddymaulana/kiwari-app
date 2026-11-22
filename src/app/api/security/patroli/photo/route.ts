import { NextRequest, NextResponse } from "next/server";
import { savePatrolPhoto } from "@/lib/securitySubmit";

// Public: Laporan Patroli photos 2–5 from the Android security app, sent
// one at a time after the report itself — multipart form with guard_id,
// pin, client_id (the report's), position (2–5), photo and captured_at.
// Write in lib/securitySubmit.ts.
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });

  const { error, duplicate, resend } = await savePatrolPhoto({
    guard_id: String(formData.get("guard_id") || ""),
    pin: String(formData.get("pin") || "").trim(),
    client_id: String(formData.get("client_id") || ""),
    position: String(formData.get("position") || ""),
    photo: formData.get("photo") as File | null,
    captured_at: String(formData.get("captured_at") || ""),
  });
  if (error) return NextResponse.json({ error, duplicate, resend }, { status: 400 });
  return NextResponse.json({ ok: true });
}
