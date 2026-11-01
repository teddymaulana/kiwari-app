import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { buildYearTable } from "@/lib/googleSheets";

export async function GET(request: NextRequest) {
  const year =
    Number(request.nextUrl.searchParams.get("year")) ||
    new Date().getFullYear();

  const user = await getCurrentUser();
  if (user?.role !== "pengurus") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const table = await buildYearTable(supabase, year);

  const csv = table
    .map((row) => row.map((v) => csvEscape(String(v))).join(","))
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
