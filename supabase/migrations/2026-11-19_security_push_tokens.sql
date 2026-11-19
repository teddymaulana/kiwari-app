-- Run this once in the Supabase SQL editor (after 2026-11-19_security_alerts).
-- Expo push tokens of the phones running the Android security app
-- (mobile/), registered via /api/security/push-token on app start. When a
-- resident sends an Alert Sekuriti, every token here gets a push — so the
-- alert arrives even when the app is closed. Tokens Expo reports as
-- DeviceNotRegistered (app uninstalled) are deleted on send.
-- Service-role only: no RLS policy, nothing reads this from the browser.

create table if not exists security_push_tokens (
  token text primary key,
  device_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table security_push_tokens enable row level security;
