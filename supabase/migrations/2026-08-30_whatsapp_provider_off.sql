-- Run this once in the Supabase SQL editor.
-- Widens the whatsapp_provider check constraint to also allow 'off' (turns
-- WhatsApp sending off entirely, everywhere) alongside 'fonnte', 'wablas',
-- and 'manual'. Safe to run whether or not you already ran the earlier
-- whatsapp_provider migrations.

alter table settings add column if not exists whatsapp_provider text not null default 'fonnte';
alter table settings drop constraint if exists settings_whatsapp_provider_check;
alter table settings add constraint settings_whatsapp_provider_check
  check (whatsapp_provider in ('fonnte', 'wablas', 'manual', 'off'));
