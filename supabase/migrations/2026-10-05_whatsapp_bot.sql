-- Run this once in the Supabase SQL editor.
-- On/off switch for Asisten Kiwari, the WhatsApp auto-reply for warga
-- (src/lib/waBot.ts). Off by default — turn it on from Pengaturan >
-- Asisten WhatsApp.

alter table settings add column if not exists whatsapp_bot_enabled boolean not null default false;
