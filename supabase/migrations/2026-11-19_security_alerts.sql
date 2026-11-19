-- Run this once in the Supabase SQL editor.
-- Alert Sekuriti: a resident (pengurus only for now) sends a message +
-- optional photo from /security, and the Android security app (mobile/)
-- picks it up by polling /api/security/alerts, vibrates and shows it
-- full-screen until a guard taps "Saya Tangani".
--
-- status: open → acknowledged (a guard took it, from the app) →
-- resolved (pengurus closed it on /security).
-- Writes only go through the service-role client (server actions on
-- /security and the app's /api/security/alerts routes), so the only RLS
-- policy is a pengurus read. Photos live in the existing private
-- bukti-kehadiran bucket under alert/.

create table if not exists security_alerts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  household_id uuid references households(id) on delete set null,
  message text not null,
  photo_path text,
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_at timestamptz,
  acknowledged_by uuid references security_guards(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists security_alerts_created_idx on security_alerts (created_at desc);
create index if not exists security_alerts_status_idx on security_alerts (status);

alter table security_alerts enable row level security;

drop policy if exists "pengurus read security_alerts" on security_alerts;
create policy "pengurus read security_alerts" on security_alerts
  for select to authenticated using (is_pengurus());
