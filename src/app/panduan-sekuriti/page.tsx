import { SECURITY_APK_URL } from "@/lib/securityApp";

// Public, unauthenticated guide for security guards (guards have no
// website login) — see the isPublicPage allowlist in
// src/lib/supabase/middleware.ts. Plain page, meant to be shared as a link
// in the guards' WhatsApp. Pengurus side: /panduan-pengurus-keamanan.
// A printed copy lives in docs/panduan/ — re-print it after edits.

export default function PanduanSekuritiPage() {
  return (
    <main className="bg-white min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8 text-gray-800 text-[15px] leading-relaxed space-y-8">
        <header>
          <h1 className="text-xl font-bold">Panduan Aplikasi Security Kiwari</h1>
          <p className="text-gray-600 mt-1">Untuk petugas security Kiwari Residence.</p>
        </header>

        <section>
          <h2 className="text-lg font-semibold mb-2">1. Pasang aplikasi</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Buka link ini di HP:{" "}
              <a href={SECURITY_APK_URL} className="text-blue-600 underline">
                Download Security Kiwari (APK)
              </a>
            </li>
            <li>Ketuk file yang sudah terunduh, lalu Pasang/Install.</li>
            <li>
              Jika muncul peringatan, izinkan &quot;Instal aplikasi tidak dikenal&quot; untuk
              browser atau WhatsApp.
            </li>
            <li>
              Buka aplikasi <b>Security Kiwari</b>. Saat ditanya soal notifikasi, pilih{" "}
              <b>Izinkan</b>.
            </li>
          </ol>
          <p className="mt-2">
            <b>HP Xiaomi / Oppo / Vivo / Realme:</b> buka Pengaturan → Aplikasi → Security
            Kiwari, nyalakan <b>Mulai otomatis (Autostart)</b> dan atur baterai ke{" "}
            <b>Tanpa batasan</b>. Kalau tidak, alert dari warga tidak masuk saat aplikasi
            tertutup.
          </p>
          <p className="mt-2">
            Buka aplikasi sekali saat ada internet, supaya daftar petugas dan jadwal
            terunduh ke HP.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Masuk</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Ketuk nama Anda.</li>
            <li>Masukkan PIN. Langsung masuk setelah angka terakhir diketik.</li>
            <li>
              Lupa PIN atau PIN salah terus? Hubungi pengurus untuk dibuatkan PIN baru.
            </li>
          </ol>
          <p className="mt-2">
            HP dipakai bergantian, jadi setelah setiap kirim data aplikasi otomatis keluar.
            Ketuk <b>Keluar</b> jika selesai tanpa kirim apa pun.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Absen 2 kali setiap shift</h2>
          <p>Shift Pagi 07.00–19.00, Malam 19.00–07.00.</p>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>
              <b>Awal shift:</b> ketuk <b>Absen Masuk</b> → <b>Ambil foto</b> (foto diri di
              pos) → <b>Kirim Absen Masuk</b>.
            </li>
            <li>
              <b>Akhir shift:</b> ketuk <b>Absen Pulang</b> → <b>Ambil foto</b> →{" "}
              <b>Kirim Absen Pulang</b>.
            </li>
          </ol>
          <p className="mt-2">
            Jam absen tercatat otomatis dari HP dan langsung masuk. Masing-masing hanya bisa
            sekali per shift. Jika tertulis &quot;ditolak pengurus&quot;, hubungi pengurus.
          </p>
          <p className="mt-2">
            <b>Tukar shift dengan rekan?</b> Jika muncul &quot;Anda tidak ada jadwal shift
            saat ini&quot;, ketuk <b>Ganti Shift</b>, lalu pilih rekan yang Anda gantikan.
            Setelah itu tombol absen dan patroli muncul seperti biasa, dan tertulis
            &quot;Menggantikan (nama)&quot;. Salah pilih? Ketuk <b>Ubah</b>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Laporan Patroli 1, 2, 3</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              Setiap shift ada 3 laporan patroli. Setiap selesai keliling, ketuk{" "}
              <b>Laporan Patroli 1</b>, lalu berikutnya <b>2</b> dan <b>3</b>.
            </li>
            <li>
              Tulis laporan, contoh: &quot;Keliling blok A–D, semua aman. Lampu jalan blok C
              mati.&quot;
            </li>
            <li>
              <b>Ambil foto</b> (wajib).
            </li>
            <li>
              Ketuk <b>Kirim Laporan Patroli</b>.
            </li>
          </ol>
          <p className="mt-2">
            Jam setiap patroli tercatat dan terlihat oleh pengurus. Petugas yang tidak
            bertugas patroli (misalnya Rahmat) hanya melihat tombol absen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Tidak ada sinyal?</h2>
          <p>
            Tetap bisa absen dan lapor. Data disimpan di HP (&quot;Tersimpan di HP&quot;) dan
            dikirim otomatis begitu ada internet. <b>Jangan hapus aplikasi</b> selama masih
            ada data yang menunggu dikirim. Di layar awal juga ada tombol{" "}
            <b>Kirim sekarang</b>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Alert dari warga 🚨</h2>
          <p>Pengurus bisa mengirim alert (pesan + foto), misalnya ada orang mencurigakan.</p>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>HP berbunyi dan bergetar, muncul notifikasi &quot;Alert dari rumah …&quot;.</li>
            <li>Ketuk notifikasinya. Aplikasi terbuka dengan layar merah berisi pesan dan foto.</li>
            <li>
              Jika belum masuk, ketuk <b>Tutup &amp; Masuk</b>, lalu masuk dengan nama dan PIN.
            </li>
            <li>
              Ketuk <b>Saya Tangani</b>, lalu segera cek ke lokasi.
            </li>
          </ol>
          <p className="mt-2">
            Setelah ada yang menekan <b>Saya Tangani</b>, alert tertulis &quot;Ditangani
            (nama)&quot; di HP petugas lain, jadi tidak ada yang dobel.
          </p>
        </section>

        <p className="text-sm text-gray-500 border-t pt-4">
          Ada kendala dengan aplikasi? Hubungi pengurus Kiwari Residence.
        </p>
      </div>
    </main>
  );
}
