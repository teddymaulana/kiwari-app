import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, SECURITY_KEHADIRAN_ACCESS } from "@/lib/auth";
import { setGuardPin, confirmCheckin, rejectCheckin } from "./actions";
import GuardPinForm from "./GuardPinForm";
import SubmitButton from "@/components/SubmitButton";
import type { SecurityGuard, SecurityCheckin, SecurityPatrol } from "@/lib/types";
import { SHIFT_LABELS, CHECKIN_STATUS_LABELS } from "@/lib/types";

export default async function SecurityKehadiranPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/report");
  if (!SECURITY_KEHADIRAN_ACCESS.includes(user.email)) redirect("/security");

  const { error } = await searchParams;

  const supabase = await createClient();
  const [{ data: guards }, { data: checkins }, { data: patrols }] = await Promise.all([
    supabase
      .from("security_guards")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .returns<SecurityGuard[]>(),
    supabase
      .from("security_checkins")
      .select("*")
      .order("checked_in_at", { ascending: false })
      .returns<SecurityCheckin[]>(),
    supabase
      .from("security_patrols")
      .select("*")
      .order("submitted_at", { ascending: false })
      .returns<SecurityPatrol[]>(),
  ]);

  const guardMap = new Map((guards ?? []).map((g) => [g.id, g.name]));

  const admin = createAdminClient();
  const photoUrls = new Map<string, string>();
  await Promise.all([
    ...(checkins ?? []).map(async (c) => {
      const { data } = await admin.storage
        .from("bukti-kehadiran")
        .createSignedUrl(c.photo_path, 60 * 10);
      if (data?.signedUrl) photoUrls.set(`checkin-${c.id}`, data.signedUrl);
    }),
    ...(patrols ?? [])
      .filter((p) => p.photo_path)
      .map(async (p) => {
        const { data } = await admin.storage
          .from("bukti-kehadiran")
          .createSignedUrl(p.photo_path!, 60 * 10);
        if (data?.signedUrl) photoUrls.set(`patrol-${p.id}`, data.signedUrl);
      }),
  ]);

  const pending = (checkins ?? []).filter((c) => c.status === "pending");
  const resolved = (checkins ?? []).filter((c) => c.status !== "pending");

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">
          Kehadiran &amp; Patroli Security
        </h1>
        <p className="text-sm text-gray-500">
          Link untuk security:{" "}
          <code className="bg-gray-100 rounded px-1.5 py-0.5">
            /security/checkin
          </code>{" "}
          (absen) dan{" "}
          <code className="bg-gray-100 rounded px-1.5 py-0.5">
            /security/patroli
          </code>{" "}
          (laporan patroli). Setiap orang butuh PIN di bawah untuk bisa
          mengirim.
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-2">PIN Security</h2>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {(guards ?? []).map((g) => (
            <div
              key={g.id}
              className="px-4 py-2.5 flex items-center justify-between gap-3"
            >
              <span className="text-sm text-gray-900">{g.name}</span>
              <GuardPinForm
                action={setGuardPin.bind(null, g.id)}
                hasPin={!!g.pin}
              />
            </div>
          ))}
          {(guards ?? []).length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              Belum ada data security.
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-2">
          Menunggu Konfirmasi ({pending.length})
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {pending.map((c) => (
            <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-medium text-gray-900">
                  {guardMap.get(c.guard_id) ?? c.guard_id}
                </span>{" "}
                <span className="text-gray-500">
                  — {SHIFT_LABELS[c.shift_type]},{" "}
                  {new Date(c.shift_date).toLocaleDateString("id-ID")}
                </span>
                <div className="text-xs text-gray-400">
                  Absen {new Date(c.checked_in_at).toLocaleString("id-ID")} ·{" "}
                  <a
                    href={photoUrls.get(`checkin-${c.id}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Lihat foto
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <form action={confirmCheckin.bind(null, c.id)}>
                  <SubmitButton
                    pendingText="..."
                    className="text-xs bg-emerald-600 text-white rounded px-2.5 py-1.5 hover:bg-emerald-700 transition"
                  >
                    Konfirmasi
                  </SubmitButton>
                </form>
                <form action={rejectCheckin.bind(null, c.id)}>
                  <SubmitButton
                    pendingText="..."
                    className="text-xs text-red-600 hover:text-red-700 transition"
                  >
                    Tolak
                  </SubmitButton>
                </form>
              </div>
            </div>
          ))}
          {pending.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              Tidak ada absen menunggu konfirmasi.
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-2">Riwayat Kehadiran</h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Tanggal</th>
                <th className="px-3 py-2 font-medium">Nama</th>
                <th className="px-3 py-2 font-medium">Shift</th>
                <th className="px-3 py-2 font-medium">Absen</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Foto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resolved.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(c.shift_date).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-3 py-2">{guardMap.get(c.guard_id) ?? c.guard_id}</td>
                  <td className="px-3 py-2 text-gray-500">{SHIFT_LABELS[c.shift_type]}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {new Date(c.checked_in_at).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs rounded-full px-2 py-0.5 ${
                        c.status === "confirmed"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {CHECKIN_STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={photoUrls.get(`checkin-${c.id}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Lihat
                    </a>
                  </td>
                </tr>
              ))}
              {resolved.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                    Belum ada riwayat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-2">Laporan Patroli</h2>
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
          {(patrols ?? []).map((p) => (
            <div key={p.id} className="px-4 py-3">
              <div className="text-sm">
                <span className="font-medium text-gray-900">
                  {guardMap.get(p.guard_id) ?? p.guard_id}
                </span>{" "}
                <span className="text-gray-500">
                  — {SHIFT_LABELS[p.shift_type]},{" "}
                  {new Date(p.shift_date).toLocaleDateString("id-ID")}
                </span>
              </div>
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{p.report}</p>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(p.submitted_at).toLocaleString("id-ID")}
                {photoUrls.get(`patrol-${p.id}`) && (
                  <>
                    {" · "}
                    <a
                      href={photoUrls.get(`patrol-${p.id}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      Lihat foto
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
          {(patrols ?? []).length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              Belum ada laporan patroli.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
