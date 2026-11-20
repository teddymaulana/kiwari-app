-- Run this once in the Supabase SQL editor.
--
-- 1. Absen twice per shift: security_checkins gets checkin_type
--    ('masuk' at the start of the shift, 'pulang' at the end). Existing
--    rows become 'masuk'. One of each per guard per shift.
-- 2. Patroli any number of times per shift: the one-per-shift unique
--    constraint on security_patrols is dropped. client_id (the app's own
--    queue id) is unique instead, so a resend after a lost reply can't
--    insert the same report twice.

alter table security_checkins
  add column if not exists checkin_type text not null default 'masuk';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'security_checkins_checkin_type_check'
  ) then
    alter table security_checkins
      add constraint security_checkins_checkin_type_check
      check (checkin_type in ('masuk', 'pulang'));
  end if;
end $$;

-- Drop the old one-per-shift unique constraints (whatever they're named),
-- i.e. any unique constraint on exactly (guard_id, shift_date, shift_type).
do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'u'
      and c.conrelid in ('security_checkins'::regclass, 'security_patrols'::regclass)
      and (
        select array_agg(a.attname::text order by a.attname)
        from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
      ) = array['guard_id', 'shift_date', 'shift_type']
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

create unique index if not exists security_checkins_guard_shift_type_key
  on security_checkins (guard_id, shift_date, shift_type, checkin_type);

alter table security_patrols add column if not exists client_id text;
create unique index if not exists security_patrols_client_id_key
  on security_patrols (client_id);
create index if not exists security_patrols_guard_shift_idx
  on security_patrols (guard_id, shift_date, shift_type);
