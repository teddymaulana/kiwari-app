-- Run this once in the Supabase SQL editor.
-- Each Laporan Patroli needs 5 photos. Photo 1 stays in
-- security_patrols.photo_path (so older reports keep working); photos 2–5
-- go here, one row per photo. The app uploads them one by one after the
-- report itself, so (patrol_id, position) is unique — a resend after a lost
-- reply just finds the row already there. Same private bucket
-- (bukti-kehadiran), service-role writes only, pengurus read.

create table if not exists security_patrol_photos (
  id uuid primary key default gen_random_uuid(),
  patrol_id uuid not null references security_patrols(id) on delete cascade,
  position smallint not null check (position between 2 and 5),
  photo_path text not null,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  unique (patrol_id, position)
);

alter table security_patrol_photos enable row level security;

drop policy if exists "pengurus read security_patrol_photos" on security_patrol_photos;
create policy "pengurus read security_patrol_photos" on security_patrol_photos
  for select to authenticated using (is_pengurus());
