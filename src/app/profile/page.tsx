import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { updatePhone } from "./actions";
import type { Household } from "@/lib/types";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const user = await getCurrentUser();

  if (!user?.householdId) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <h1 className="text-lg font-semibold text-gray-900 mb-6">Profil</h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          Rumah belum ditautkan ke akun ini, hubungi pengurus.
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: household } = await supabase
    .from("households")
    .select("*")
    .eq("id", user.householdId)
    .single<Household>();

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Profil</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">No. Rumah</p>
          <p className="text-sm text-gray-900">{household?.unit_no}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Kepala Keluarga</p>
          <p className="text-sm text-gray-900">{household?.name}</p>
        </div>
        <p className="text-xs text-gray-400">
          No. Rumah dan nama kepala keluarga hanya bisa diubah pengurus.
        </p>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-700 mb-1">No. HP</h2>
        <p className="text-xs text-gray-400 mb-4">
          Dipakai untuk kirim notifikasi WhatsApp (mis. saat pembayaran
          dikonfirmasi). Pastikan diisi dengan benar.
        </p>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            No. HP berhasil disimpan.
          </div>
        )}

        <form
          action={updatePhone}
          className="bg-white border border-gray-200 rounded-lg p-6 flex gap-3"
        >
          <input
            name="phone"
            placeholder="mis. 08123456789"
            defaultValue={household?.phone ?? ""}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Simpan
          </button>
        </form>
      </div>
    </div>
  );
}
