-- Run this once in the Supabase SQL editor.
-- Tukar shift: a guard working a shift that isn't theirs on the schedule
-- picks, in the app, which colleague they're covering ("Ganti Shift").
-- Every absen and patrol for that shift then records who was replaced, so
-- pengurus see "menggantikan X" / "digantikan Y" instead of a missed shift.

alter table security_checkins
  add column if not exists replaces_guard_id uuid references security_guards(id) on delete set null;

alter table security_patrols
  add column if not exists replaces_guard_id uuid references security_guards(id) on delete set null;
