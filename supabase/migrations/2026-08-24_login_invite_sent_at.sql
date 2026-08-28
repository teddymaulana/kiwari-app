-- Run this once in the Supabase SQL editor.
-- Adds the column households/actions.ts (sendLoginInvite) writes to and
-- households/page.tsx reads to show the "Terkirim ..." / "Kirim Ulang" status.

alter table households add column if not exists login_invite_sent_at timestamptz;
