import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { Household, Payment, Settings } from "@/lib/types";
import { MONTH_NAMES, formatRupiah } from "@/lib/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; success?: string }>;
}) {
  const user = await getCurrentUser();
  const isPengurus = user?.role === "pengurus";

  const sp = await searchParams;
  const now = new Date();
  const year = Number(sp.year) || now.getFullYear();
  const month = Number(sp.month) || now.getMonth() + 1;

  const supabase = await createClient();

  const [
    { data: households },
    { data: payments },
    { data: settings },
    { data: myHistory },
  ] = await Promise.all([
    supabase
      .from("households")
      .select("*")
      .eq("is_active", true)
      .order("unit_no")
      .returns<Household[]>(),
    supabase
      .from("payments")
      .select("*")
      .eq("period_year", year)
      .eq("period_month", month)
      .returns<Payment[]>(),
    supabase.from("settings").select("*").eq("id", 1).single<Settings>(),
    user?.householdId
      ? supabase
          .from("payments")
          .select("*")
          .eq("household_id", user.householdId)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .returns<Payment[]>()
      : Promise.resolve({ data: null as Payment[] | null }),
  ]);

  const paidByHousehold = new Map((payments ?? []).map((p) => [p.household_id, p]));
  const myHousehold = user?.householdId
    ? (households ?? []).find((h) => h.id === user.householdId) ?? null
    : null;
  const myPayment = myHousehold ? paidByHousehold.get(myHousehold.id) : null;
  const totalHouseholds = households?.length ?? 0;
  const paidCount = (households ?? []).filter((h) =>
    paidByHousehold.has(h.id)
  ).length;
  const totalCollected = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const expectedTotal = totalHouseholds * Number(settings?.monthly_amount ?? 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {sp.success && (
        <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Pembayaran berhasil dicatat.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-lg font-semibold text-gray-900">
          Dashboard — {MONTH_NAMES[month - 1]} {year}
        </h1>
        <form className="flex gap-2 items-center text-sm" action="/dashboard">
          <select
            name="month"
            defaultValue={month}
            className="rounded border border-gray-300 px-2 py-1"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="number"
            name="year"
            defaultValue={year}
            className="w-20 rounded border border-gray-300 px-2 py-1"
          />
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50"
          >
            Lihat
          </button>
        </form>
      </div>

      {!isPengurus && (
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {myHousehold ? (
            <div
              className={`rounded-lg border p-4 ${
                myPayment
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <p
                className={`text-xs mb-1 ${
                  myPayment ? "text-green-600" : "text-red-600"
                }`}
              >
                IPL Bulan Ini
              </p>
              <p
                className={`text-2xl font-semibold ${
                  myPayment ? "text-green-700" : "text-red-700"
                }`}
              >
                {myPayment ? "Lunas" : "Belum Bayar"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {myHousehold.unit_no} - {myHousehold.name}
                {myPayment &&
                  ` · ${formatRupiah(Number(myPayment.amount))}`}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs text-gray-500 mb-1">IPL Bulan Ini</p>
              <p className="text-sm text-gray-500">
                Rumah belum ditautkan, hubungi pengurus.
              </p>
            </div>
          )}
        </div>
      )}

      {!isPengurus && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Riwayat Pembayaran
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Periode</th>
                  <th className="px-4 py-2 font-medium">Tanggal Bayar</th>
                  <th className="px-4 py-2 font-medium">Jumlah</th>
                  <th className="px-4 py-2 font-medium">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(myHistory ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">
                      {MONTH_NAMES[p.period_month - 1]} {p.period_year}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(p.paid_date).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-2">
                      {formatRupiah(Number(p.amount))}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {p.note || "-"}
                    </td>
                  </tr>
                ))}
                {(myHistory ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-gray-400"
                    >
                      Belum ada riwayat pembayaran.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isPengurus && (
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Sudah Bayar</p>
            <p className="text-2xl font-semibold text-gray-900">
              {paidCount} / {totalHouseholds}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Terkumpul</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatRupiah(totalCollected)}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Target Bulan Ini</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatRupiah(expectedTotal)}
            </p>
          </div>
        </div>
      )}

      {isPengurus && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">
              Status per Warga
            </h2>
            <Link
              href="/payments/new"
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Catat pembayaran
            </Link>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">No. Rumah</th>
                  <th className="px-4 py-2 font-medium">Nama</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(households ?? []).map((h) => {
                  const p = paidByHousehold.get(h.id);
                  return (
                    <tr key={h.id}>
                      <td className="px-4 py-2">{h.unit_no}</td>
                      <td className="px-4 py-2">{h.name}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                            p
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {p ? "Lunas" : "Belum Bayar"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {p ? formatRupiah(Number(p.amount)) : "-"}
                      </td>
                    </tr>
                  );
                })}
                {(households ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-gray-400"
                    >
                      Belum ada data warga.{" "}
                      <Link href="/households" className="text-blue-600">
                        Tambah warga
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
