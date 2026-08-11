# Kas Warga — Aplikasi Iuran (IPL)

Web app sederhana untuk mencatat iuran bulanan (IPL) warga. Dibuat dengan
Next.js + Supabase. Cocok untuk pemakaian oleh 1-2 pengurus (RT/RW/bendahara),
gratis untuk skala kecil.

Fitur:
- Login pengurus (tanpa pendaftaran publik)
- Dashboard: status bayar/belum per warga untuk bulan berjalan, total terkumpul
- Catat pembayaran per warga per bulan
- Kelola data warga (tambah, aktif/nonaktifkan)
- Laporan tahunan (grid 12 bulan per warga) + export CSV
- Nominal iuran bisa diubah di halaman Pengaturan
- Log aktivitas (siapa mencatat apa, kapan) — jejak audit sederhana

## 1. Buat project Supabase

1. Daftar/login di [supabase.com](https://supabase.com) → buat project baru (free tier cukup).
2. Buka **SQL Editor** → jalankan seluruh isi file `supabase/schema.sql` di repo ini.
   Ini akan membuat tabel `households`, `payments`, `settings`, `activity_log`.
3. Buka **Project Settings → API** → salin `Project URL` dan `anon public` key.
4. Buat akun pengurus di **Authentication → Users → Add user** (isi email +
   password langsung, tidak perlu proses konfirmasi email untuk 1-2 admin).

## 2. Setup lokal

```bash
npm install
cp .env.local.example .env.local
# isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY
# dari Project Settings > API di Supabase
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000), login pakai akun yang
dibuat di langkah 1.4.

## 3. Deploy (gratis)

- Push project ini ke GitHub.
- Buka [vercel.com](https://vercel.com) → Import project dari GitHub.
- Saat konfigurasi, isi environment variable yang sama seperti `.env.local`
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Deploy. Vercel free tier + Supabase free tier = Rp 0/bulan untuk
  pemakaian skala RT/RW.

Catatan: project Supabase gratis akan "tidur" otomatis setelah 7 hari tanpa
aktivitas, tapi akan aktif lagi otomatis begitu ada request (jeda beberapa
detik saja). Tidak masalah untuk pemakaian bulanan seperti ini.

## Struktur data (ringkas)

- `households` — daftar rumah/warga (no. rumah, nama, no. HP, status aktif)
- `payments` — satu baris = satu warga bayar untuk satu bulan/tahun tertentu
  (unique per warga+bulan+tahun, jadi tidak bisa double-input)
- `settings` — nominal iuran bulanan default
- `activity_log` — jejak siapa mencatat/mengubah apa

## Backup data

Karena ini data uang, sebaiknya rutin (mis. tiap bulan) export CSV dari
halaman Laporan sebagai cadangan di luar database. Supabase juga punya
backup otomatis di paket berbayar, tapi export manual sudah cukup untuk
skala ini.

## Pengembangan lanjutan (ide)

- Notifikasi WhatsApp/email otomatis untuk warga yang belum bayar
- Multi-tahun growth chart di dashboard
- Upload bukti transfer (Supabase Storage)
- Role warga (read-only) untuk transparansi, terpisah dari role pengurus
