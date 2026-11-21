import Image from "next/image";
import { SECURITY_APK_URL } from "@/lib/securityApp";

// Phone-width screenshots of the real screens (public/panduan/), guard
// photos blurred.
function Shot({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className={`mt-3 w-full h-auto border border-gray-200 rounded ${
        width > 375 ? "" : "max-w-[375px]"
      }`}
    />
  );
}

// Public guide for pengurus on the Keamanan features (how-to text only,
// no data) — public so it can be shared/printed as PDF like
// /panduan-sekuriti; see the isPublicPage allowlist in
// src/lib/supabase/middleware.ts. The features themselves stay gated by
// SECURITY_KEHADIRAN_ACCESS / SECURITY_ALERT_SENDERS in lib/auth.ts.
// A printed copy lives in docs/panduan/ — re-print it after edits.

export default function PanduanPengurusKeamananPage() {
  return (
    <main className="bg-white min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8 text-gray-800 text-[15px] leading-relaxed space-y-8">
        <header>
          <h1 className="text-xl font-bold">Panduan Keamanan untuk Pengurus</h1>
          <p className="text-gray-600 mt-1">
            Website Kiwari (kiwari-app.vercel.app) → menu <b>Keamanan</b>.
          </p>
        </header>

        <section>
          <h2 className="text-lg font-semibold mb-2">Siapa bisa apa</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <b>Semua warga:</b> Jadwal Security dan Kontak Security.
            </li>
            <li>
              <b>Pengurus Keamanan:</b> Kehadiran &amp; Patroli dan Kirim
              Alert ke Sekuriti.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">1. Jadwal Security</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Buka menu <b>Keamanan</b>. Pilih bulan, lalu <b>Lihat</b>.</li>
            <li>
              Kolom biru = hari ini. Tanda <b>*</b> = dibuat otomatis dari pola rotasi, cek
              ulang sebelum dipakai.
            </li>
            <li>
              <b>Generate Bulan Berikutnya</b> membuat jadwal satu bulan ke depan dari pola
              rotasi. Tidak mengubah jadwal yang sudah ada.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. PIN petugas</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Di halaman Keamanan, ketuk tombol kuning <b>Kehadiran &amp; Patroli Security</b>.
            </li>
            <li>
              Bagian <b>PIN Security</b>: ketuk <b>Ubah PIN</b> di samping nama petugas, isi
              PIN baru (4–6 angka), <b>Simpan</b>.
            </li>
            <li>Beritahu PIN ke petugas secara pribadi. Jangan kirim di grup.</li>
          </ol>
          <p className="mt-2">
            Petugas baru atau PIN baru masuk ke aplikasi setelah HP petugas tersambung
            internet.
          </p>
          <Shot src="/panduan/pengurus-pin.png" alt="Bagian PIN Security dengan tombol Ubah PIN" width={375} height={248} />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Absen dan patroli</h2>
          <p>
            Petugas absen 2 kali per shift (<b>Absen Masuk</b> di awal, <b>Absen
            Pulang</b> di akhir) dan lapor <b>Patroli 1, 2, 3</b> (dengan foto). Rahmat
            hanya absen, tidak patroli. Semua jam tercatat dari HP petugas. Petugas yang
            tukar shift tetap bisa absen; di Rekap ditandai <b>di luar jadwal</b>.
          </p>
          <p className="mt-2">
            Absen dan patroli <b>langsung tercatat</b>, tidak perlu dikonfirmasi pengurus.
          </p>
          <p className="mt-2">
            Jika ada absen yang jelas salah (misalnya foto bukan di pos), buka{" "}
            <b>Riwayat Kehadiran</b>, ketuk <b>Lihat</b> untuk cek fotonya, lalu ketuk{" "}
            <b>Tolak</b>. Absen yang ditolak tidak dihitung dan tidak bisa diulang untuk
            shift itu; petugas melihat &quot;ditolak pengurus&quot; di aplikasi.
          </p>
          <p className="mt-2">
            Ringkasan per bulan (bahan bonus/insentif) ada di bawah halaman Keamanan.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Laporan per personel dan tanggal</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Di halaman <b>Kehadiran &amp; Patroli Security</b>, pilih <b>Personel</b>{" "}
              (atau <b>Semua</b>).
            </li>
            <li>
              Pilih tanggal dengan tombol cepat <b>Hari ini</b>, <b>Kemarin</b> atau{" "}
              <b>Minggu ini</b> (Senin sampai hari ini), atau isi <b>Dari tanggal</b> dan{" "}
              <b>Sampai tanggal</b> lalu ketuk <b>Tampilkan</b>.
            </li>
            <li>
              <b>Reset</b> kembali ke semua personel, 14 hari terakhir.
            </li>
          </ol>
          <p className="mt-2">Yang ikut tersaring:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <b>Rekap per Shift</b>: jam masuk, jam pulang, dan jam Patroli 1–3 (P1, P2, P3)
              per petugas per shift.
            </li>
            <li>
              <b>Riwayat Kehadiran</b>: setiap absen (Masuk/Pulang) dan statusnya.
            </li>
            <li>
              <b>Laporan Patroli</b>: isi laporan dan foto.
            </li>
          </ul>
          <p className="mt-2">
            Tanggal = tanggal mulai shift. Shift Malam 19/11 (19.00–07.00) masuk ke tanggal
            19/11.
          </p>
          <Shot src="/panduan/pengurus-filter-rekap.png" alt="Filter Personel dan tanggal dengan tombol Hari ini, Kemarin, Minggu ini, dan tabel Rekap per Shift" width={688} height={388} />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Kirim Alert ke Sekuriti 🚨</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Di halaman Keamanan, kotak merah <b>Kirim Alert ke Sekuriti</b>.
            </li>
            <li>Tulis pesan, contoh: &quot;Ada orang mencurigakan di depan 12B, mohon dicek.&quot;</li>
            <li>
              Opsional: <b>Ambil / pilih foto</b>.
            </li>
            <li>
              Ketuk <b>Kirim Alert ke Sekuriti</b>. Semua HP petugas berbunyi, walaupun
              aplikasi tertutup.
            </li>
          </ol>
          <Shot src="/panduan/pengurus-alert-form.png" alt="Halaman Keamanan: tombol Kehadiran & Patroli Security dan kotak Kirim Alert ke Sekuriti" width={375} height={442} />
          <p className="mt-2">Status di <b>Alert Terakhir</b>:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <b>Belum ditangani</b>: belum ada petugas yang menerima.
            </li>
            <li>
              <b>Ditangani</b>: petugas sudah menekan Saya Tangani (nama dan jam terlihat).
            </li>
            <li>
              <b>Selesai</b>: ketuk <b>Tandai Selesai</b> setelah urusannya beres.
            </li>
          </ul>
          <Shot src="/panduan/pengurus-alert-terakhir.png" alt="Daftar Alert Terakhir dengan status" width={375} height={190} />
          <p className="mt-2">
            Untuk keadaan darurat, tetap telepon petugas langsung (Kontak Security).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Aplikasi di HP petugas</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Link pasang aplikasi:{" "}
              <a href={SECURITY_APK_URL} className="text-blue-600 underline break-all">
                Download Security Kiwari (APK)
              </a>
            </li>
            <li>
              Panduan untuk petugas:{" "}
              <a
                href="https://kiwari-app.vercel.app/panduan-sekuriti"
                className="text-blue-600 underline"
              >
                kiwari-app.vercel.app/panduan-sekuriti
              </a>{" "}
              (atau kirim file PDF-nya ke WhatsApp petugas).
            </li>
            <li>
              Pastikan notifikasi diizinkan. Di HP Xiaomi/Oppo/Vivo/Realme nyalakan
              Autostart dan atur baterai ke Tanpa batasan.
            </li>
            <li>
              Jika alert tidak masuk di satu HP: buka aplikasi sekali saat ada internet, lalu
              coba kirim alert tes.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
