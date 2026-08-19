import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { addContribution, deleteContribution } from "./actions";
import SumbanganTabs from "./SumbanganTabs";
import type { Contribution, Household } from "@/lib/types";
import { formatRupiah, KAS_LABELS, compareUnitNo } from "@/lib/types";
import HouseholdSelect from "@/components/HouseholdSelect";

type UnitRow = { id: string; unit_no: string; label: string };
type ContributionRow = Contribution & {
  households: Pick<Household, "unit_no" | "name"> | null;
};

export default async function ContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; success?: string }>;
}) {
  const sp = await searchParams;
  const year = Number(sp.year) || new Date().getFullYear();

  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: households }, { data: activeHh }, { data: contributions }] =
    await Promise.all([
      supabase.from("households").select("*").returns<Household[]>(),
      supabase
        .from("households")
        .select("*")
        .eq("is_active", true)
        .returns<Household[]>(),
      supabase
        .from("contributions")
        .select("*, households(unit_no, name)")
        .gte("contribution_date", `${year}-01-01`)
        .lte("contribution_date", `${year}-12-31`)
        .order("contribution_date", { ascending: true })
        .returns<ContributionRow[]>(),
    ]);

  const units: UnitRow[] = (households ?? []).map((h) => ({
    id: h.id,
    unit_no: h.unit_no,
    label: `${h.unit_no} - ${h.name}`,
  }));
  const activeHouseholds = activeHh ?? [];
  const detailRows = contributions ?? [];
  const allEntries = detailRows.map((c) => ({
    household_id: c.household_id,
    amount: Number(c.amount),
  }));

  units.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));
  activeHouseholds.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  const householdEntries = detailRows.filter((c) => c.household_id);
  const externalDetailRows = detailRows.filter((c) => !c.household_id);

  // Distinct acara among household-linked entries, in the order they first
  // appear (entries are fetched oldest-first) — becomes the grid's columns.
  const eventNames: string[] = [];
  householdEntries.forEach((e) => {
    if (!eventNames.includes(e.event_name)) eventNames.push(e.event_name);
  });

  const amountMap = new Map<string, number>();
  householdEntries.forEach((e) => {
    const key = `${e.household_id}|${e.event_name}`;
    amountMap.set(key, (amountMap.get(key) ?? 0) + Number(e.amount));
  });

  const rowTotal = (householdId: string) =>
    eventNames.reduce(
      (s, ev) => s + (amountMap.get(`${householdId}|${ev}`) ?? 0),
      0
    );

  const eventTotals = new Map<string, number>();
  householdEntries.forEach((e) => {
    eventTotals.set(
      e.event_name,
      (eventTotals.get(e.event_name) ?? 0) + Number(e.amount)
    );
  });
  const grandTotal = eventNames.reduce((s, ev) => s + (eventTotals.get(ev) ?? 0), 0);

  const yearTotal = allEntries.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-lg font-semibold text-gray-900">
          Sumbangan {year}
        </h1>
        <form className="flex gap-2 items-center text-sm" action="/contributions">
          <input
            type="number"
            name="year"
            defaultValue={year}
            className="w-24 rounded border border-gray-300 px-2 py-1"
          />
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50"
          >
            Lihat
          </button>
        </form>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        Total sumbangan {year}: <strong>{formatRupiah(yearTotal)}</strong>
      </p>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-4">
          Catat Sumbangan
        </h2>
        {sp.success && (
          <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Sumbangan berhasil dicatat.
          </div>
        )}
        <form action={addContribution} className="grid sm:grid-cols-6 gap-3">
          <div className="sm:col-span-2">
            <HouseholdSelect
              households={activeHouseholds}
              name="household_id"
              placeholder="Pilih warga (kosongkan jika bukan warga)..."
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            name="source_name"
            placeholder="Atau sumber lain (mis. Sumbangan Developer)"
            className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            name="event_name"
            placeholder="Acara (mis. Sumbangan Agustusan 2026)"
            required
            className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            type="number"
            name="amount"
            placeholder="Jumlah (Rp)"
            required
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            name="contribution_date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="kas_type"
            defaultValue="bri"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="bri">Kas BRI</option>
            <option value="tunai">Petty Cash</option>
          </select>
          <input
            name="note"
            placeholder="Catatan (opsional)"
            className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            className="sm:col-span-6 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Simpan
          </button>
        </form>
      </div>

      <SumbanganTabs
        warga={
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="text-xs">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium sticky left-0 bg-gray-50">
                    Warga
                  </th>
                  {eventNames.map((ev) => (
                    <th key={ev} className="px-3 py-2 font-medium whitespace-nowrap">
                      {ev}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {eventNames.length > 0 && (
                  <tr className="bg-blue-50 font-semibold">
                    <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-blue-50">
                      Total
                    </td>
                    {eventNames.map((ev) => (
                      <td key={ev} className="px-3 py-2 whitespace-nowrap">
                        {formatRupiah(eventTotals.get(ev) ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatRupiah(grandTotal)}
                    </td>
                  </tr>
                )}
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white">
                      {u.label}
                    </td>
                    {eventNames.map((ev) => {
                      const amt = amountMap.get(`${u.id}|${ev}`);
                      return (
                        <td key={ev} className="px-3 py-2 whitespace-nowrap">
                          {amt ? formatRupiah(amt) : <span className="text-gray-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 whitespace-nowrap font-medium">
                      {rowTotal(u.id) > 0 ? formatRupiah(rowTotal(u.id)) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
                {(units.length === 0 || eventNames.length === 0) && (
                  <tr>
                    <td
                      colSpan={eventNames.length + 2}
                      className="px-3 py-6 text-center text-gray-400"
                    >
                      Belum ada acara sumbangan warga tahun ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        }
        lainLain={
          <div className="space-y-8">
            <div>
              <p className="text-xs text-gray-400 mb-2">
                Sumbangan yang bukan dari warga (atau hanya dari sebagian
                kecil warga) — mis. sumbangan developer, RW/RT.
              </p>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Tanggal</th>
                      <th className="px-4 py-2 font-medium">Sumber</th>
                      <th className="px-4 py-2 font-medium">Acara</th>
                      <th className="px-4 py-2 font-medium">Jumlah</th>
                      <th className="px-4 py-2 font-medium">Kas</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {externalDetailRows.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {new Date(c.contribution_date).toLocaleDateString("id-ID")}
                        </td>
                        <td className="px-4 py-2">{c.source_name || "—"}</td>
                        <td className="px-4 py-2">{c.event_name}</td>
                        <td className="px-4 py-2 text-gray-500">
                          {formatRupiah(Number(c.amount))}
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {KAS_LABELS[c.kas_type]}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <form action={deleteContribution.bind(null, c.id)}>
                            <button
                              type="submit"
                              className="text-xs text-red-600 hover:text-red-700 transition"
                            >
                              Hapus
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                    {externalDetailRows.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-6 text-center text-gray-400"
                        >
                          Belum ada sumbangan lain-lain tahun ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-700 mb-2">
                Kelola Sumbangan Warga
              </h2>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Tanggal</th>
                      <th className="px-4 py-2 font-medium">Warga</th>
                      <th className="px-4 py-2 font-medium">Acara</th>
                      <th className="px-4 py-2 font-medium">Jumlah</th>
                      <th className="px-4 py-2 font-medium">Kas</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {householdEntries.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {new Date(c.contribution_date).toLocaleDateString("id-ID")}
                        </td>
                        <td className="px-4 py-2">
                          {c.households?.unit_no} - {c.households?.name}
                        </td>
                        <td className="px-4 py-2">{c.event_name}</td>
                        <td className="px-4 py-2 text-gray-500">
                          {formatRupiah(Number(c.amount))}
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {KAS_LABELS[c.kas_type]}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <form action={deleteContribution.bind(null, c.id)}>
                            <button
                              type="submit"
                              className="text-xs text-red-600 hover:text-red-700 transition"
                            >
                              Hapus
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                    {householdEntries.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                          Belum ada sumbangan warga tercatat tahun ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        }
      />
    </div>
  );
}
