import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { addHousehold, toggleHouseholdActive, updateAltNames } from "./actions";
import type { Household } from "@/lib/types";
import { compareUnitNo } from "@/lib/types";

export default async function HouseholdsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const supabase = await createClient();
  const { data: households } = await supabase
    .from("households")
    .select("*")
    .returns<Household[]>();

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-6">
        Data Warga
      </h1>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-4">
          Tambah warga baru
        </h2>
        <form action={addHousehold} className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <input
              name="unit_no"
              placeholder="No. Rumah (mis. Blok A-12)"
              required
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="name"
              placeholder="Nama Kepala Keluarga"
              required
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="phone"
              placeholder="No. HP (opsional)"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            name="alt_names"
            placeholder="Nama lain yang bisa transfer, pisahkan koma (mis. istri/suami — opsional)"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Tambah
          </button>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">No. Rumah</th>
              <th className="px-4 py-2 font-medium">Nama</th>
              <th className="px-4 py-2 font-medium">No. HP</th>
              <th className="px-4 py-2 font-medium">
                Nama Lain (utk cocokkan bukti transfer)
              </th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(households ?? []).map((h) => (
              <tr key={h.id}>
                <td className="px-4 py-2 whitespace-nowrap">{h.unit_no}</td>
                <td className="px-4 py-2 whitespace-nowrap">{h.name}</td>
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {h.phone || "-"}
                </td>
                <td className="px-4 py-2">
                  <form
                    action={updateAltNames.bind(null, h.id)}
                    className="flex gap-2"
                  >
                    <input
                      name="alt_names"
                      defaultValue={h.alt_names ?? ""}
                      placeholder="mis. istri/suami"
                      className="w-48 rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                    <button
                      type="submit"
                      className="text-xs text-blue-600 hover:text-blue-700 shrink-0"
                    >
                      Simpan
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      h.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {h.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <form
                    action={toggleHouseholdActive.bind(
                      null,
                      h.id,
                      h.is_active
                    )}
                  >
                    <button
                      type="submit"
                      className="text-xs text-gray-500 hover:text-blue-600 transition"
                    >
                      {h.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(households ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Belum ada data warga.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
