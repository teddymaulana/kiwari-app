-- Run this once in the Supabase SQL editor.
--
-- 1. security_guards.needs_patrol: guards who only absen (no Laporan
--    Patroli in the app). Everyone so far patrols; Rahmat doesn't.
-- 2. Add Rahmat (absen only). Set his PIN afterwards on
--    /security/kehadiran (PIN Security → Ubah PIN).
-- 3. Patroli 1, 2, 3 per shift: security_patrols.patrol_no, one row per
--    slot per guard per shift. Existing rows are numbered by time. The
--    max of 3 is enforced by the app/server (older shifts may have more).

alter table security_guards
  add column if not exists needs_patrol boolean not null default true;

insert into security_guards (name, needs_patrol, is_active)
select 'Rahmat', false, true
where not exists (
  select 1 from security_guards where lower(trim(name)) = 'rahmat'
);

alter table security_patrols add column if not exists patrol_no smallint;

with numbered as (
  select id,
         row_number() over (
           partition by guard_id, shift_date, shift_type
           order by coalesce(captured_at, submitted_at), id
         ) as n
  from security_patrols
)
update security_patrols p
set patrol_no = numbered.n
from numbered
where p.id = numbered.id and p.patrol_no is null;

alter table security_patrols alter column patrol_no set not null;

create unique index if not exists security_patrols_slot_key
  on security_patrols (guard_id, shift_date, shift_type, patrol_no);
