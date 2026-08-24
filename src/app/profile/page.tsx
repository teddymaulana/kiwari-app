import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { updatePhone, updatePassword } from "./actions";
import type { Household } from "@/lib/types";
import SubmitButton from "@/components/SubmitButton";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    success?: string;
    pw_error?: string;
    pw_success?: string;
  }>;
}) {
  const { error, success, pw_error, pw_success } = await searchParams;
  const user = await getCurrentUser();

  let household: Household | null = null;
  if (user?.householdId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("households")
      .select("*")
      .eq("id", user.householdId)
      .single<Household>();
    household = data;
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Profil</h1>

      {user?.householdId ? (
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
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          Rumah belum ditautkan ke akun ini.
        </div>
      )}

      {user?.householdId && (
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
            className="bg-white border border-gray-200 rounded-lg p-6 space-y-3"
          >
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                No. HP
              </label>
              <input
                name="phone"
                placeholder="mis. 08123456789"
                defaultValue={household?.phone ?? ""}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                No. HP Pasangan
              </label>
              <input
                name="phone_pasangan"
                placeholder="mis. 08123456789"
                defaultValue={household?.phone_pasangan ?? ""}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <SubmitButton
              pendingText="Menyimpan..."
              className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 transition"
            >
              Simpan
            </SubmitButton>
          </form>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-medium text-gray-700 mb-1">
          Ganti Password
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Minimal 6 karakter.
        </p>

        {pw_error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {pw_error}
          </div>
        )}
        {pw_success && (
          <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Password berhasil diubah.
          </div>
        )}

        <form
          action={updatePassword}
          className="bg-white border border-gray-200 rounded-lg p-6 space-y-3"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password Baru
            </label>
            <input
              type="password"
              name="new_password"
              required
              minLength={6}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Konfirmasi Password Baru
            </label>
            <input
              type="password"
              name="confirm_password"
              required
              minLength={6}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <SubmitButton
            pendingText="Menyimpan..."
            className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium hover:bg-blue-700 transition"
          >
            Simpan Password
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
