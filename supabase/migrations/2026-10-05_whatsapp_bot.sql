-- Run this once in the Supabase SQL editor.
-- On/off switch for Asisten Kiwari, the WhatsApp auto-reply for warga
-- (src/lib/waBot.ts). Off by default. No UI while the bot is private —
-- turn it on/off here:
--   update settings set whatsapp_bot_enabled = true where id = 1;
--   update settings set whatsapp_bot_enabled = false where id = 1;

alter table settings add column if not exists whatsapp_bot_enabled boolean not null default false;
