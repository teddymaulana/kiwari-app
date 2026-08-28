-- Run this once in the Supabase SQL editor.
-- Widens the whatsapp_provider check constraint to also allow 'manual'
-- (the wa.me click-to-chat option) alongside 'fonnte' and 'wablas'. Safe
-- to run whether or not you already ran the earlier
-- 2026-08-28_whatsapp_provider_toggle.sql migration.

alter table settings add column if not exists whatsapp_provider text not null default 'fonnte';
alter table settings drop constraint if exists settings_whatsapp_provider_check;
alter table settings add constraint settings_whatsapp_provider_check
  check (whatsapp_provider in ('fonnte', 'wablas', 'manual'));
