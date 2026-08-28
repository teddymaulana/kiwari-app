-- Run this once in the Supabase SQL editor.
-- Adds the column settings/page.tsx reads/writes for the Fonnte/Wablas
-- toggle, and src/lib/whatsapp.ts reads before every send.

alter table settings add column if not exists whatsapp_provider text
  not null default 'fonnte' check (whatsapp_provider in ('fonnte', 'wablas'));
