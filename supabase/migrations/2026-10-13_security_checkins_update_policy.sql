-- Run this once in the Supabase SQL editor.
-- Lets pengurus confirm/reject a guard's check-in on /security/kehadiran.
-- security_checkins only had a read policy, so those updates were
-- silently filtered by RLS (0 rows changed, no error) and the entry
-- stayed under "Menunggu Konfirmasi". Inserts still go only through the
-- service-role client (lib/securitySubmit.ts).

drop policy if exists "pengurus update security_checkins" on security_checkins;
create policy "pengurus update security_checkins" on security_checkins
  for update to authenticated using (is_pengurus()) with check (is_pengurus());
