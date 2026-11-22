import { NextRequest, NextResponse } from "next/server";
import { savePatrol } from "@/lib/securitySubmit";

// Public: Laporan Patroli from the Android security app — multipart form
// with guard_id, pin, shift_date, shift_type, report, photo (required),
// captured_at, client_id and patrol_no (1–3; older builds omit it and get
// the next free slot). Write in lib/securitySubmit.ts.
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });

  const { error, duplicate, resend } = await savePatrol({
    guard_id: String(formData.get("guard_id") || ""),
    pin: String(formData.get("pin") || "").trim(),
    shift_date: String(formData.get("shift_date") || ""),
    shift_type: String(formData.get("shift_type") || ""),
    report: String(formData.get("report") || "").trim(),
    photo: formData.get("photo") as File | null,
    captured_at: String(formData.get("captured_at") || ""),
    client_id: String(formData.get("client_id") || ""),
    patrol_no: String(formData.get("patrol_no") || ""),
    replaces_guard_id: String(formData.get("replaces_guard_id") || ""),
  });
  if (error) return NextResponse.json({ error, duplicate, resend }, { status: 400 });
  return NextResponse.json({ ok: true });
}
