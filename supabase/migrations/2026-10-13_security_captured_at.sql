-- Run this once in the Supabase SQL editor.
-- When the guard actually took the photo (or, for a patrol report with no
-- photo, pressed Kirim) on their phone — separate from checked_in_at /
-- submitted_at, which is when the row reached the server. The Android
-- security app (mobile/) queues submissions while offline and sends them
-- later, so the two can be hours apart. Set from the phone's clock, so
-- pengurus should read a big gap as "sent late", not as proof. Null for
-- web submissions, where the two are the same moment.

alter table security_checkins add column if not exists captured_at timestamptz;
alter table security_patrols add column if not exists captured_at timestamptz;
