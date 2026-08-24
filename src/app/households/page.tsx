import fs from "fs";
import path from "path";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { addHousehold, toggleHouseholdActive, sendLoginInvite } from "./actions";
import ToggleActiveButton from "./ToggleActiveButton";
import SubmitButton from "@/components/SubmitButton";
import type { Household } from "@/lib/types";
import { compareUnitNo } from "@/lib/types";

// Units with a retrievable login password (see actions.ts findCredential) —
// used only to decide whether "Kirim Info Login" shows for a row.
function unitsWithCredentials(): Set<string> {
  const csvPath = path.join(process.cwd(), "warga_credentials.csv");
  const units = new Set<string>();
  let csv: string;
  try {
    csv = fs.readFileSync(csvPath, "utf8");
  } catch {
    return units;
  }
  csv.split("\n").slice(1).forEach((line) => {
    const m = line.match(/^([^,]+),"([^"]*)",([^,]+),([^,]*),(.+)$/);
    if (m && m[5].trim() === "OK") units.add(m[1].trim());
  });
  return units;
}

export default async function HouseholdsPage({
  searchParams,
}: {
  searchParams: Promise<{ wa_success?: string; wa_error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/dashboard");

  const { wa_success, wa_error } = await searchParams;

  const supabase = await createClient();
  const { data: households } = await supabase
    .from("households")
    .select("*")
    .returns<Household[]>();

  households?.sort((a, b) => compareUnitNo(a.unit_no, b.unit_no));

  const credentialUnits = unitsWithCredentials();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-6">
        Data Warga
      </h1>

      {wa_success && (
        <div className="mb-6 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Info login berhasil dikirim.
        </div>
      )}
      {wa_error && (
        <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          Gagal mengirim: {wa_error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-4">
          Tambah warga baru
        </h2>
        <form action={addHousehold} className="space-y-3">
          <div className="grid sm:grid-cols-4 gap-3">
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
            <input
              name="phone_pasangan"
              placeholder="No. HP Pasangan (opsional)"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <input
            name="alt_names"
            placeholder="Nama lain yang bisa transfer, pisahkan koma (mis. istri/suami — opsional)"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <SubmitButton
            pendingText="Menyimpan..."
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Tambah
          </SubmitButton>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">No. Rumah</th>
              <th className="px-4 py-2 font-medium">Nama</th>
              <th className="px-4 py-2 font-medium">No. HP</th>
              <th className="px-4 py-2 font-medium">Nama Pasangan</th>
              <th className="px-4 py-2 font-medium">No HP. Pasangan</th>
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
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {h.alt_names || "-"}
                </td>
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {h.phone_pasangan || "-"}
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
                <td className="px-4 py-2 text-right whitespace-nowrap space-x-3">
                  {/* Rolled out to 18G only for now, while this feature is
                      being tried out — see sendLoginInvite in actions.ts,
                      which also enforces this server-side. */}
                  {h.unit_no === "18G" && credentialUnits.has(h.unit_no) && h.phone && (
                    <form
                      action={sendLoginInvite.bind(null, h.id)}
                      className="inline"
                    >
                      <SubmitButton
                        pendingText="Mengirim..."
                        className="text-xs text-blue-600 hover:text-blue-700 transition"
                      >
                        Kirim Info Login
                      </SubmitButton>
                    </form>
                  )}
                  <ToggleActiveButton
                    action={toggleHouseholdActive.bind(
                      null,
                      h.id,
                      h.is_active
                    )}
                    householdLabel={`${h.unit_no} - ${h.name}`}
                    isActive={h.is_active}
                  />
                </td>
              </tr>
            ))}
            {(households ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
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
