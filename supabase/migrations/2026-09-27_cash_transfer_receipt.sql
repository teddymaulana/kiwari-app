-- Run this once in the Supabase SQL editor.
-- Adds an optional bukti transfer upload to Transfer Kas (/settings):
-- a receipt_path column on cash_transfers plus its own private bucket —
-- same treatment as bukti-pengeluaran (service_role-only, viewed via
-- signed URLs on /mutasi).

alter table cash_transfers add column if not exists receipt_path text;

insert into storage.buckets (id, name, public)
values ('bukti-transfer-kas', 'bukti-transfer-kas', false)
on conflict (id) do nothing;
