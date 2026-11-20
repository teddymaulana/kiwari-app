import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buktiHref } from "@/lib/bukti";
import { getCurrentUser, SECURITY_KEHADIRAN_ACCESS } from "@/lib/auth";
import { setGuardPin, confirmCheckin, rejectCheckin } from "./actions";
import RejectCheckinForm from "./RejectCheckinForm";
import GuardPinForm from "./GuardPinForm";
import SubmitButton from "@/components/SubmitButton";
import type { SecurityGuard, SecurityCheckin, SecurityPatrol } from "@/lib/types";
import { SHIFT_LABELS, CHECKIN_STATUS_LABELS, CHECKIN_TYPE_LABELS } from "@/lib/types";

// Always Jakarta time — the server (Vercel) runs in UTC.
const TZ = "Asia/Jakarta";
function dateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { timeZone: TZ });
}
function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

// When a submission carries captured_at (sent from the Android app, which
// may queue it offline — see schema.sql), show when the photo was taken
// alongside when it actually arrived, so a late send is visible.
function sentTimes(sentAt: string, capturedAt: string | null, label: string) {
  const sent = dateTime(sentAt);
  if (!capturedAt) return `${label} ${sent}`;
  return `Foto ${dateTime(capturedAt)} · Dikirim ${sent}`;
}

// When the guard actually did it: the phone's photo/report time, else
// arrival at the server.
const checkinAt = (c: SecurityCheckin) => c.captured_at ?? c.checked_in_at;
const patrolAt = (p: SecurityPatrol) => p.captured_at ?? p.submitted_at;

// How many days back the Rekap per Shift table goes.
const RECAP_DAYS = 14;

// YYYY-MM-DD of n days ago, to compare against shift_date.
function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

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

  const photoUrls = new Map<string, string>();
  (checkins ?? [])
    .filter((c) => c.photo_path)
    .forEach((c) => photoUrls.set(`checkin-${c.id}`, buktiHref("checkin", c.id)));
  (patrols ?? [])
    .filter((p) => p.photo_path)
    .forEach((p) => photoUrls.set(`patrol-${p.id}`, buktiHref("patrol", p.id)));

  const pending = (checkins ?? []).filter((c) => c.status === "pending");
  const resolved = (checkins ?? []).filter((c) => c.status !== "pending");

  // Rekap per Shift: one row per guard per shift with any activity in the
  // last RECAP_DAYS days — absen masuk, absen pulang and every patrol time.
  const recapFrom = daysAgo(RECAP_DAYS);
  type Recap = {
    guard_id: string;
    shift_date: string;
    shift_type: "pagi" | "malam";
    masuk?: SecurityCheckin;
    pulang?: SecurityCheckin;
    patrols: SecurityPatrol[];
  };
  const recapMap = new Map<string, Recap>();
  const recapRow = (r: { guard_id: string; shift_date: string; shift_type: "pagi" | "malam" }) => {
    const key = `${r.guard_id}|${r.shift_date}|${r.shift_type}`;
    let row = recapMap.get(key);
    if (!row) {
      row = { guard_id: r.guard_id, shift_date: r.shift_date, shift_type: r.shift_type, patrols: [] };
      recapMap.set(key, row);
    }
    return row;
  };
  (checkins ?? [])
    .filter((c) => c.shift_date >= recapFrom)
    .forEach((c) => {
      recapRow(c)[c.checkin_type === "pulang" ? "pulang" : "masuk"] = c;
    });
  (patrols ?? [])
    .filter((p) => p.shift_date >= recapFrom)
    .forEach((p) => recapRow(p).patrols.push(p));
  const recap = [...recapMap.values()].sort(
    (a, b) =>
      b.shift_date.localeCompare(a.shift_date) ||
      (a.shift_type === b.shift_type ? 0 : a.shift_type === "malam" ? -1 : 1) ||
      (guardMap.get(a.guard_id) ?? "").localeCompare(guardMap.get(b.guard_id) ?? "")
  );
  recap.forEach((r) => r.patrols.sort((a, b) => patrolAt(a).localeCompare(patrolAt(b))));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">
          Kehadiran &amp; Patroli Security
        </h1>
        <p className="text-sm text-gray-500">
          Petugas absen dan lapor patroli lewat aplikasi Security Kiwari di
          HP. Setiap orang butuh PIN di bawah untuk bisa masuk.
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
              {/* Thumbnail so the photo can be checked at a glance; click
                  for the full size. Signed URL, so not optimized. */}
              {photoUrls.get(`checkin-${c.id}`) && (
                <a
                  href={photoUrls.get(`checkin-${c.id}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <Image
                    src={photoUrls.get(`checkin-${c.id}`)!}
                    alt={`Foto absen ${guardMap.get(c.guard_id) ?? ""}`}
                    width={48}
                    height={48}
                    unoptimized
                    className="w-12 h-12 rounded object-cover border border-gray-200"
                  />
                </a>
              )}
              <div className="text-sm flex-1 min-w-0">
                <span className="font-medium text-gray-900">
                  {guardMap.get(c.guard_id) ?? c.guard_id}
                </span>{" "}
                <span className="text-gray-500">
                  — {CHECKIN_TYPE_LABELS[c.checkin_type ?? "masuk"]},{" "}
                  {SHIFT_LABELS[c.shift_type]},{" "}
                  {new Date(c.shift_date).toLocaleDateString("id-ID")}
                </span>
                <div className="text-xs text-gray-400">
                  {sentTimes(c.checked_in_at, c.captured_at, "Absen")}
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
                <RejectCheckinForm
                  action={rejectCheckin.bind(null, c.id)}
                  guardName={guardMap.get(c.guard_id) ?? "security"}
                  shiftLabel={`${c.checkin_type === "pulang" ? "pulang" : "masuk"} ${SHIFT_LABELS[c.shift_type]}, ${new Date(c.shift_date).toLocaleDateString("id-ID")}`}
                />
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
        <h2 className="text-sm font-medium text-gray-700 mb-1">
          Rekap per Shift ({RECAP_DAYS} hari terakhir)
        </h2>
        <p className="text-xs text-gray-400 mb-2">
          Jam = saat foto diambil / laporan ditulis di HP petugas.
        </p>
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Tanggal</th>
                <th className="px-3 py-2 font-medium">Shift</th>
                <th className="px-3 py-2 font-medium">Nama</th>
                <th className="px-3 py-2 font-medium">Masuk</th>
                <th className="px-3 py-2 font-medium">Pulang</th>
                <th className="px-3 py-2 font-medium">Patroli</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recap.map((r) => (
                <tr key={`${r.guard_id}-${r.shift_date}-${r.shift_type}`} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(r.shift_date).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{SHIFT_LABELS[r.shift_type]}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {guardMap.get(r.guard_id) ?? r.guard_id}
                  </td>
                  {[r.masuk, r.pulang].map((c, i) => (
                    <td key={i} className="px-3 py-2 whitespace-nowrap">
                      {c ? (
                        <>
                          <span className="tabular-nums">{clock(checkinAt(c))}</span>
                          {c.status !== "confirmed" && (
                            <span
                              className={`ml-1 text-xs ${
                                c.status === "rejected" ? "text-red-600" : "text-amber-600"
                              }`}
                            >
                              ({CHECKIN_STATUS_LABELS[c.status]})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {r.patrols.length === 0 ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <>
                        <span className="font-medium">{r.patrols.length}×</span>{" "}
                        <span className="text-gray-500 tabular-nums">
                          {r.patrols.map((p) => clock(patrolAt(p))).join(", ")}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {recap.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                    Belum ada absen atau patroli.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
                <th className="px-3 py-2 font-medium">Jenis</th>
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
                    {c.checkin_type === "pulang" ? "Pulang" : "Masuk"}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {dateTime(c.checked_in_at)}
                    {c.captured_at && (
                      <div className="text-xs text-gray-400">
                        Foto {dateTime(c.captured_at)}
                      </div>
                    )}
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
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
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
                {sentTimes(p.submitted_at, p.captured_at, "Dikirim")}
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
