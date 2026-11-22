"use client";

import { useState } from "react";
import { zipSync } from "fflate";
import { deleteArchivedPhotos } from "./actions";
import type { ArchivePhoto } from "@/lib/securityPhotos";

// Arsip Foto: download one month's absen + patroli photos (plus the Excel
// rekap) as a ZIP, built here in the browser from signed URLs, then
// optionally delete exactly those photos from storage. Delete only shows
// after that month's ZIP has finished downloading on this page, and never
// for the current month.

type Done = { month: string; checkin: string[]; patrol: string[]; count: number };

export default function PhotoArchive({ currentMonth, lastMonth }: { currentMonth: string; lastMonth: string }) {
  const [month, setMonth] = useState(lastMonth);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function download() {
    setBusy(true);
    setError("");
    setDone(null);
    setProgress("Menyiapkan daftar foto…");
    try {
      const res = await fetch(`/api/security/photos?month=${month}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Gagal memuat daftar foto");
      const { photos, missing } = body as { photos: ArchivePhoto[]; missing: number };
      if (photos.length === 0) {
        setProgress("");
        setError(
          missing > 0
            ? `Foto bulan ini sudah dihapus dari server (${missing} foto).`
            : "Tidak ada foto di bulan ini."
        );
        return;
      }

      const files: Record<string, Uint8Array> = {};
      let fetched = 0;
      const queue = [...photos];
      const worker = async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          const r = await fetch(p.url);
          if (!r.ok) throw new Error(`Gagal mengunduh ${p.name}`);
          files[`foto/${p.name}`] = new Uint8Array(await r.arrayBuffer());
          fetched++;
          setProgress(`Mengunduh foto ${fetched}/${photos.length}…`);
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));

      setProgress("Menambahkan rekap Excel…");
      const xlsx = await fetch(`/api/security/export?month=${month}`);
      if (xlsx.ok) {
        files[`rekap-absensi-patroli-${month}.xlsx`] = new Uint8Array(await xlsx.arrayBuffer());
      }

      setProgress("Membuat file ZIP…");
      // JPEGs are already compressed — store them as-is (level 0).
      const zip = zipSync(files, { level: 0 });
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `foto-security-${month}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      setDone({
        month,
        checkin: photos.filter((p) => p.kind === "checkin").map((p) => p.id),
        patrol: photos.filter((p) => p.kind === "patrol").map((p) => p.id),
        count: photos.length,
      });
      setProgress(
        `${photos.length} foto diunduh (${(zip.length / 1048576).toFixed(1)} MB)` +
          (missing > 0 ? `, ${missing} foto sudah dihapus sebelumnya.` : ".")
      );
    } catch (e) {
      setProgress("");
      setError(e instanceof Error ? e.message : "Gagal membuat ZIP");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!done) return;
    setDeleting(true);
    const res = await deleteArchivedPhotos(done.month, { checkin: done.checkin, patrol: done.patrol });
    setDeleting(false);
    setConfirming(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone(null);
    setProgress(`${res.deleted} foto ${done.month} dihapus dari server.`);
  }

  const canDelete = done && done.month === month && done.month < currentMonth;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Arsip foto absen &amp; patroli per bulan</span>
        <input
          type="month"
          value={month}
          max={currentMonth}
          onChange={(e) => {
            setMonth(e.target.value);
            setProgress("");
            setError("");
          }}
          className="rounded border border-gray-300 px-2 py-1"
        />
      </label>
      <button
        type="button"
        onClick={download}
        disabled={busy || !month}
        className="rounded bg-gray-900 text-white px-4 py-1.5 font-medium hover:bg-gray-700 disabled:opacity-50"
      >
        {busy ? "Memproses…" : "Download Foto (ZIP)"}
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded border border-red-300 text-red-700 px-4 py-1.5 font-medium hover:bg-red-50"
        >
          Hapus {done.count} foto dari server
        </button>
      )}
      {progress && <p className="w-full text-xs text-gray-600">{progress}</p>}
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
      {done && done.month >= currentMonth && (
        <p className="w-full text-xs text-gray-400">
          Foto bulan berjalan belum bisa dihapus. Hapus setelah bulan selesai.
        </p>
      )}
      <p className="w-full text-xs text-gray-400">
        ZIP berisi semua foto absen &amp; patroli bulan itu plus rekap Excel. Setelah ZIP tersimpan,
        foto bisa dihapus dari server supaya penyimpanan tidak penuh. Data absen &amp; laporan tetap
        ada, hanya fotonya yang dihapus.
      </p>

      {confirming && done && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-5 space-y-3">
            <h3 className="font-semibold text-gray-900">Hapus foto {done.month}?</h3>
            <p className="text-sm text-gray-600">
              {done.count} foto akan dihapus permanen dari server. Pastikan file{" "}
              <span className="font-mono text-xs">foto-security-{done.month}.zip</span> sudah tersimpan
              dan bisa dibuka. Foto tidak bisa dikembalikan dari website.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="rounded bg-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Menghapus…" : "Ya, hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
