import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Household, Payment } from "@/lib/types";

export async function GET(request: NextRequest) {
  const year =
    Number(request.nextUrl.searchParams.get("year")) ||
    new Date().getFullYear();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [{ data: households }, { data: payments }] = await Promise.all([
    supabase
      .from("households")
      .select("*")
      .order("unit_no")
      .returns<Household[]>(),
    supabase
      .from("payments")
      .select("*")
      .eq("period_year", year)
      .returns<Payment[]>(),
  ]);

  const paidMap = new Map<string, Payment>();
  (payments ?? []).forEach((p) => {
    paidMap.set(`${p.household_id}-${p.period_month}`, p);
  });

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const header = ["No. Rumah", "Nama", ...months.map((m) => `Bulan ${m}`), "Total"];
  const rows = (households ?? []).map((h) => {
    let total = 0;
    const cells = months.map((m) => {
      const p = paidMap.get(`${h.id}-${m}`);
      if (p) total += Number(p.amount);
      return p ? String(Number(p.amount)) : "";
    });
    return [h.unit_no, h.name, ...cells, String(total)];
  });

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-iuran-${year}.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
