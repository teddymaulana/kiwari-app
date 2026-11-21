-- Run this once in the Supabase SQL editor.
-- Pengurus no longer confirm absen: every check-in counts as soon as it
-- arrives (the server now saves new ones as 'confirmed'). This confirms
-- the ones still waiting and makes 'confirmed' the default. Pengurus can
-- still Tolak a clearly wrong absen from Riwayat Kehadiran.

update security_checkins set status = 'confirmed' where status = 'pending';

alter table security_checkins alter column status set default 'confirmed';
