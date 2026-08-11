# Kiwari App — Aplikasi Iuran (IPL)

Web app sederhana untuk mencatat iuran bulanan (IPL) warga. Dibuat dengan
Next.js + Supabase. Cocok untuk pemakaian oleh 1-2 pengurus (RT/RW/bendahara),
gratis untuk skala kecil.

Fitur:
- Login dengan dua role: **pengurus** (akses penuh) dan **warga** (read-only,
  hanya bisa lihat data rumahnya sendiri — bukan data warga lain)
- Dashboard: pengurus lihat status bayar/belum semua warga + total terkumpul;
  warga lihat status bayar rumahnya sendiri saja
- Catat pembayaran per warga per bulan (pengurus)
- Kelola data warga (tambah, aktif/nonaktifkan) (pengurus)
- Laporan tahunan (grid 12 bulan) + export CSV — pengurus lihat semua warga,
  warga hanya lihat riwayat rumahnya sendiri
- Nominal iuran bisa diubah di halaman Pengaturan (pengurus)
- Log aktivitas (siapa mencatat apa, kapan) — jejak audit sederhana (pengurus)

## 1. Buat project Supabase

1. Daftar/login di [supabase.com](https://supabase.com) → buat project baru (free tier cukup).
2. Buka **SQL Editor** → jalankan seluruh isi file `supabase/schema.sql` di repo ini.
   Ini akan membuat tabel `households`, `payments`, `settings`, `activity_log`,
   `profiles` (role), beserta Row Level Security-nya. File ini aman dijalankan
   ulang kalau kamu update schema-nya nanti (idempotent).
3. Buka **Project Settings → API** → salin `Project URL` dan `anon public` key.
4. Buat akun pengurus di **Authentication → Users → Add user** (isi email +
   password langsung, tidak perlu proses konfirmasi email untuk 1-2 admin).

### Role: warga vs pengurus

Setiap user punya satu baris di tabel `profiles` dengan kolom `role`
(`warga` atau `pengurus`). Default untuk **user baru** adalah `warga`
(read-only) — kalau kamu buat akun baru lewat Authentication → Users, dia
otomatis dapat role `warga` dan hanya bisa lihat Dashboard + Laporan.

Untuk menjadikan seseorang **pengurus** (akses penuh: catat pembayaran,
kelola warga, ubah pengaturan), jalankan di SQL Editor:

```sql
update profiles set role = 'pengurus'
where id = (select id from auth.users where email = 'email-pengurus@contoh.com');
```

Akun yang sudah ada sebelum fitur role ini ditambahkan otomatis jadi
`pengurus` (tidak ada yang kehilangan akses saat migrasi).

Pengurus juga bisa membuat login warga baru langsung dari halaman
**Pengaturan** di app (bukan lewat Supabase dashboard) — akun yang dibuat
lewat panel ini selalu jadi role `warga` dan wajib dipilihkan rumahnya
(`household_id` di `profiles`), supaya pas login dia langsung lihat status
iuran rumahnya sendiri di Dashboard ("Info Anda"). Untuk pengurus tetap
lewat SQL di atas. Fitur ini butuh `service_role` key (lihat langkah 2 di
bawah).

## 2. Setup lokal

```bash
npm install
cp .env.local.example .env.local
# isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY
# dari Project Settings > API di Supabase
#
# isi juga SUPABASE_SERVICE_ROLE_KEY dari Project Settings > API > service_role
# (secret, JANGAN pakai prefix NEXT_PUBLIC_, dan jangan commit ke git — key
# ini bisa bypass semua RLS, hanya dipakai server-side untuk fitur "Tambah
# User Warga" di halaman Pengaturan)
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000), login pakai akun yang
dibuat di langkah 1.4.

## 3. Deploy (gratis)

- Push project ini ke GitHub.
- Buka [vercel.com](https://vercel.com) → Import project dari GitHub.
- Saat konfigurasi, isi environment variable yang sama seperti `.env.local`
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`).
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
- `activity_log` — jejak siapa mencatat/mengubah apa (khusus pengurus)
- `profiles` — role tiap user (`warga` / `pengurus`) + `household_id` yang
  menautkan login warga ke rumahnya, satu baris per akun login

## Backup data

Karena ini data uang, sebaiknya rutin (mis. tiap bulan) export CSV dari
halaman Laporan sebagai cadangan di luar database. Supabase juga punya
backup otomatis di paket berbayar, tapi export manual sudah cukup untuk
skala ini.

## Pengembangan lanjutan (ide)

- Notifikasi WhatsApp/email otomatis untuk warga yang belum bayar
- Multi-tahun growth chart di dashboard
- Upload bukti transfer (Supabase Storage)
- Daftar user + tombol ubah role langsung dari UI (saat ini via SQL Editor)
