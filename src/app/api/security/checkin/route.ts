import { NextRequest, NextResponse } from "next/server";
import { saveCheckin } from "@/lib/securitySubmit";

// Public: Absen Kehadiran from the Android security app — multipart form
// with guard_id, pin, shift_date, shift_type, photo and captured_at (when
// the photo was taken, see schema.sql). Same write as the /security/checkin
// page (lib/securitySubmit.ts).
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });

  const { error, duplicate } = await saveCheckin({
    guard_id: String(formData.get("guard_id") || ""),
    pin: String(formData.get("pin") || "").trim(),
    shift_date: String(formData.get("shift_date") || ""),
    shift_type: String(formData.get("shift_type") || ""),
    photo: formData.get("photo") as File | null,
    captured_at: String(formData.get("captured_at") || ""),
  });
  if (error) return NextResponse.json({ error, duplicate }, { status: 400 });
  return NextResponse.json({ ok: true });
}
