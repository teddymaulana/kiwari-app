import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buktiHref } from "@/lib/bukti";
import { getCurrentUser, SECURITY_KEHADIRAN_ACCESS } from "@/lib/auth";
import { setGuardPin, rejectCheckin } from "./actions";
import RejectCheckinForm from "./RejectCheckinForm";
import GuardPinForm from "./GuardPinForm";
import type { SecurityGuard, SecurityCheckin, SecurityPatrol } from "@/lib/types";
import { SHIFT_LABELS, CHECKIN_STATUS_LABELS } from "@/lib/types";

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

// Default date range of the filter (Rekap, Riwayat, Laporan Patroli).
const DEFAULT_DAYS = 14;

// YYYY-MM-DD in Jakarta, n days ago — compared against shift_date.
function jakartaDate(daysBack = 0) {
  return new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
    timeZone: TZ,
  });
}
const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function SecurityKehadiranPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; guard?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "pengurus") redirect("/report");
  if (!SECURITY_KEHADIRAN_ACCESS.includes(user.email)) redirect("/security");

  const sp = await searchParams;
  const { error } = sp;
  // Filter: personel + tanggal (shift date), for Rekap per Shift, Riwayat
  // Kehadiran and Laporan Patroli.
  const filterGuard = sp.guard || "";
  const filterFrom = isDate(sp.from) ? sp.from : jakartaDate(DEFAULT_DAYS);
  const filterTo = isDate(sp.to) ? sp.to : jakartaDate();
  // Quick ranges (keep the chosen personel). Minggu ini = Senin–hari ini.
  const today = jakartaDate();
  const yesterday = jakartaDate(1);
  const sinceMonday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const quickRanges = [
    { label: "Hari ini", from: today, to: today },
    { label: "Kemarin", from: yesterday, to: yesterday },
    { label: "Minggu ini", from: jakartaDate(sinceMonday), to: today },
  ];
  const rangeHref = (from: string, to: string) =>
    `/security/kehadiran?${new URLSearchParams({
      ...(filterGuard ? { guard: filterGuard } : {}),
      from,
      to,
    })}`;
  const inFilter = (r: { guard_id: string; shift_date: string }) =>
    (!filterGuard || r.guard_id === filterGuard) &&
    r.shift_date >= filterFrom &&
    r.shift_date <= filterTo;

  const supabase = await createClient();
  const [{ data: guards }, { data: checkins }, { data: patrols }, { data: shifts }] =
    await Promise.all([
    // All guards, so former guards' old records still show a name; only
    // active ones get PINs and appear in the filter.
    supabase
      .from("security_guards")
      .select("*")
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
    // Schedule for the filter range, to flag absen/patroli done outside a
    // guard's scheduled shift (e.g. swapped with a colleague).
    supabase
      .from("security_shifts")
      .select("guard_id, shift_date, shift_type")
      .gte("shift_date", filterFrom)
      .lte("shift_date", filterTo)
      .in("shift_type", ["pagi", "malam"])
      .returns<{ guard_id: string; shift_date: string; shift_type: string }[]>(),
  ]);

  const guardMap = new Map((guards ?? []).map((g) => [g.id, g.name]));
  const activeGuards = (guards ?? []).filter((g) => g.is_active);
  const noPatrol = new Set((guards ?? []).filter((g) => g.needs_patrol === false).map((g) => g.id));
  const scheduled = new Set(
    (shifts ?? []).map((sh) => `${sh.guard_id}|${sh.shift_date}|${sh.shift_type}`)
  );

  const photoUrls = new Map<string, string>();
  (checkins ?? [])
    .filter((c) => c.photo_path)
    .forEach((c) => photoUrls.set(`checkin-${c.id}`, buktiHref("checkin", c.id)));
  (patrols ?? [])
    .filter((p) => p.photo_path)
    .forEach((p) => photoUrls.set(`patrol-${p.id}`, buktiHref("patrol", p.id)));

  // Absen count as soon as they arrive (no confirmation step); pengurus can
  // still Tolak a wrong one from Riwayat Kehadiran.
  const history = (checkins ?? []).filter(inFilter);
  const filteredPatrols = (patrols ?? []).filter(inFilter);

  // Rekap per Shift: one row per guard per shift with any activity in the
  // filter — absen masuk, absen pulang and every patrol time.
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
    .filter(inFilter)
    .forEach((c) => {
      recapRow(c)[c.checkin_type === "pulang" ? "pulang" : "masuk"] = c;
    });
  filteredPatrols
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
          {activeGuards.map((g) => (
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
          {activeGuards.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              Belum ada data security.
            </div>
          )}
        </div>
      </div>

      <form
        action="/api/security/export"
        className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-end gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Rekap Absensi &amp; Patroli per bulan</span>
          <input
            type="month"
            name="month"
            defaultValue={jakartaDate().slice(0, 7)}
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-emerald-600 text-white px-4 py-1.5 font-medium hover:bg-emerald-700"
        >
          Download Excel
        </button>
        <p className="w-full text-xs text-gray-400">
          File .xlsx berwarna (bisa dibuka di Excel / Google Sheets): rekap per hari, detail
          per shift, dan laporan patroli.
        </p>
      </form>

      <form
        action="/security/kehadiran"
        className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-end gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Personel</span>
          <select
            name="guard"
            defaultValue={filterGuard}
            className="rounded border border-gray-300 px-2 py-1.5"
          >
            <option value="">Semua</option>
            {activeGuards.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Dari tanggal</span>
          <input
            type="date"
            name="from"
            defaultValue={filterFrom}
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Sampai tanggal</span>
          <input
            type="date"
            name="to"
            defaultValue={filterTo}
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-gray-900 text-white px-4 py-1.5 font-medium hover:bg-gray-700"
        >
          Tampilkan
        </button>
        <a href="/security/kehadiran" className="text-blue-600 hover:underline py-1.5">
          Reset
        </a>
        <div className="w-full flex flex-wrap gap-2">
          {quickRanges.map((r) => {
            const active = r.from === filterFrom && r.to === filterTo;
            return (
              <a
                key={r.label}
                href={rangeHref(r.from, r.to)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  active
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {r.label}
              </a>
            );
          })}
        </div>
        <p className="w-full text-xs text-gray-400">
          Berlaku untuk Rekap per Shift, Riwayat Kehadiran dan Laporan Patroli di bawah.
        </p>
      </form>

      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-1">
          Rekap per Shift
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
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {SHIFT_LABELS[r.shift_type]}
                    {!scheduled.has(`${r.guard_id}|${r.shift_date}|${r.shift_type}`) && (
                      <div
                        title="Tidak ada di jadwal petugas ini (misalnya tukar shift)"
                        className="text-[11px] text-orange-600"
                      >
                        di luar jadwal
                      </div>
                    )}
                  </td>
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
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.patrols.length === 0 ? (
                      <span className="text-gray-300">
                        {noPatrol.has(r.guard_id) ? "tidak perlu" : "—"}
                      </span>
                    ) : (
                      <span className="text-gray-700 tabular-nums">
                        {r.patrols.map((p) => (
                          <span key={p.id} className="mr-2">
                            <span className="text-gray-400">P{p.patrol_no}</span> {clock(patrolAt(p))}
                          </span>
                        ))}
                      </span>
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
              {history.map((c) => (
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
                    {c.status === "rejected" ? (
                      <span className="text-xs rounded-full px-2 py-0.5 bg-red-50 text-red-700">
                        {CHECKIN_STATUS_LABELS[c.status]}
                      </span>
                    ) : (
                      <RejectCheckinForm
                        action={rejectCheckin.bind(null, c.id)}
                        guardName={guardMap.get(c.guard_id) ?? "security"}
                        shiftLabel={`${c.checkin_type === "pulang" ? "pulang" : "masuk"} ${SHIFT_LABELS[c.shift_type]}, ${new Date(c.shift_date).toLocaleDateString("id-ID")}`}
                      />
                    )}
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
              {history.length === 0 && (
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
          {filteredPatrols.map((p) => (
            <div key={p.id} className="px-4 py-3">
              <div className="text-sm">
                <span className="font-medium text-gray-900">
                  {guardMap.get(p.guard_id) ?? p.guard_id}
                </span>{" "}
                <span className="text-gray-500">
                  — Patroli {p.patrol_no}, {SHIFT_LABELS[p.shift_type]},{" "}
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
          {filteredPatrols.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              Belum ada laporan patroli.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
