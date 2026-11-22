-- Run this once in the Supabase SQL editor.
-- Absen Pulang now carries a short end-of-shift report (Laporan) written
-- by the guard in the app. Null for absen masuk and older absen.

alter table security_checkins add column if not exists report text;
