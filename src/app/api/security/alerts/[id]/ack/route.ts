import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGuard } from "@/lib/securitySubmit";

// "Saya Tangani" from the Android security app: the logged-in guard takes
// an open alert. guard_id + pin (form fields) identify who, same as an
// absen; the app key gates it like the rest of the app's API. Only the
// first guard wins — a later tap gets the name of whoever already has it.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/security/alerts/[id]/ack">) {
  const appKey = process.env.SECURITY_APP_KEY;
  if (!appKey || request.headers.get("x-app-key") !== appKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const formData = await request.formData().catch(() => null);
  const guard = await verifyGuard(
    String(formData?.get("guard_id") || ""),
    String(formData?.get("pin") || "").trim()
  );
  if (!guard) return NextResponse.json({ error: "Nama atau PIN salah" }, { status: 400 });

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("security_alerts")
    .update({
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: guard.id,
    })
    .eq("id", id)
    .eq("status", "open")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!updated || updated.length === 0) {
    const { data: row } = await admin
      .from("security_alerts")
      .select("status, security_guards(name)")
      .eq("id", id)
      .maybeSingle<{ status: string; security_guards: { name: string } | null }>();
    if (!row) return NextResponse.json({ error: "Alert tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ ok: true, already: row.security_guards?.name ?? null });
  }
  return NextResponse.json({ ok: true });
}
