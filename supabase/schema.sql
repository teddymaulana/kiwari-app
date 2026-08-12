-- IPL / Iuran app schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)

create extension if not exists "pgcrypto";

-- One row: the current monthly fee. Kept as a table (not hardcoded) so the
-- treasurer can update it from the Settings page without touching code.
create table if not exists settings (
  id int primary key default 1,
  monthly_amount numeric(12,2) not null default 50000,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);
insert into settings (id, monthly_amount) values (1, 50000)
  on conflict (id) do nothing;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  unit_no text not null,           -- e.g. "Blok A No. 12"
  name text not null,              -- head of household
  phone text,
  -- Comma-separated other names who might send the transfer (e.g. spouse)
  -- — a unit can have one registered head of household but several people
  -- actually paying, and the bank receipt shows whoever sent it. Used by
  -- the "Bayar IPL" receipt OCR matcher on /login as extra name candidates.
  alt_names text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table households add column if not exists alt_names text;

-- status: "confirmed" (recorded by pengurus, or approved) vs "pending"
-- (self-submitted via the public "Bayar IPL" form on /login, not yet
-- verified). Only "confirmed" rows count toward Lunas/totals anywhere in
-- the app. The unique constraint applies regardless of status, so a
-- pending claim blocks a duplicate submission for the same period until a
-- pengurus confirms or rejects (deletes) it.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  amount numeric(12,2) not null,
  paid_date date not null default current_date,
  note text,
  recorded_by text,                -- email of the admin who entered it
  status text not null default 'confirmed' check (status in ('pending', 'confirmed')),
  receipt_path text,                -- Storage object path for uploaded bukti transfer, if any
  created_at timestamptz not null default now(),
  unique (household_id, period_year, period_month)
);

alter table payments add column if not exists status text
  not null default 'confirmed' check (status in ('pending', 'confirmed'));
alter table payments add column if not exists receipt_path text;

-- Private bucket for uploaded payment receipts ("bukti transfer"). No public
-- read policy — only the service_role key (server-side) can read/write, so
-- receipts are never directly browsable; pengurus view them via signed URLs
-- generated on demand from the Verifikasi Pembayaran queue.
insert into storage.buckets (id, name, public)
values ('bukti-transfer', 'bukti-transfer', false)
on conflict (id) do nothing;

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text,
  action text not null,            -- e.g. "payment.create", "household.create"
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists payments_period_idx on payments (period_year, period_month);
create index if not exists payments_household_idx on payments (household_id);

-- Roles: "warga" (resident, read-only) vs "pengurus" (admin, full access).
-- One row per auth user. New signups default to "warga" (least privilege);
-- promote someone to "pengurus" by updating their row here. household_id
-- ties a warga login to their own household so the app can show their
-- personal payment status; pengurus accounts leave it null.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'warga' check (role in ('warga', 'pengurus')),
  household_id uuid references households(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table profiles add column if not exists household_id uuid
  references households(id) on delete set null;

-- Auto-create a profile row whenever a new auth user is created (e.g. via
-- Authentication > Users > Add user), defaulting to the "warga" role.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'warga')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: any auth user that already existed before roles were introduced
-- is grandfathered in as "pengurus" so nobody loses access on this migration.
insert into profiles (id, role)
select id, 'pengurus' from auth.users
on conflict (id) do nothing;

-- security definer: these run as the function owner, which bypasses RLS on
-- profiles for this one internal lookup. Without this, evaluating them can
-- recurse into the "pengurus read all profiles" policy below (which itself
-- calls is_pengurus()) and blow the stack — Postgres doesn't guarantee OR
-- short-circuit order across combined RLS policies, so this isn't optional.
create or replace function is_pengurus()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'pengurus'
  );
$$;

create or replace function my_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from profiles where id = auth.uid();
$$;

-- Row Level Security: pengurus can read/write everything. Warga can only
-- read their own household's data (via profiles.household_id) — never
-- other residents' payments, contact info, or the activity log. There is
-- no public sign-up flow in the app, so create admin accounts manually in
-- Supabase Auth (see README).
alter table settings enable row level security;
alter table households enable row level security;
alter table payments enable row level security;
alter table activity_log enable row level security;
alter table profiles enable row level security;

drop policy if exists "authenticated write settings" on settings;
drop policy if exists "authenticated read settings" on settings;
drop policy if exists "pengurus write settings" on settings;
create policy "authenticated read settings" on settings
  for select to authenticated using (true);
create policy "pengurus write settings" on settings
  for all to authenticated using (is_pengurus()) with check (is_pengurus());

drop policy if exists "authenticated all households" on households;
drop policy if exists "authenticated read households" on households;
drop policy if exists "pengurus write households" on households;
create policy "authenticated read households" on households
  for select to authenticated using (
    is_pengurus() or id = my_household_id()
  );
create policy "pengurus write households" on households
  for all to authenticated using (is_pengurus()) with check (is_pengurus());

drop policy if exists "authenticated all payments" on payments;
drop policy if exists "authenticated read payments" on payments;
drop policy if exists "pengurus write payments" on payments;
create policy "authenticated read payments" on payments
  for select to authenticated using (
    is_pengurus() or household_id = my_household_id()
  );
create policy "pengurus write payments" on payments
  for all to authenticated using (is_pengurus()) with check (is_pengurus());

-- activity_log is an internal admin audit trail (shown on the Pengaturan
-- page, which is pengurus-only) — not exposed to warga at all.
drop policy if exists "authenticated all activity_log" on activity_log;
drop policy if exists "pengurus all activity_log" on activity_log;
create policy "pengurus all activity_log" on activity_log
  for all to authenticated using (is_pengurus()) with check (is_pengurus());

drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists "pengurus read all profiles" on profiles;
create policy "pengurus read all profiles" on profiles
  for select to authenticated using (is_pengurus());
drop policy if exists "pengurus update profiles" on profiles;
create policy "pengurus update profiles" on profiles
  for update to authenticated using (is_pengurus()) with check (is_pengurus());

-- Public-safe cuts of households/payments for the Laporan page: warga can
-- see every unit's payment status there (community-wide transparency,
-- unlike Dashboard which stays scoped to their own household), but never
-- names, phone numbers, notes, or who recorded a payment. Views run as
-- their owner by default, which bypasses the base tables' RLS — that's
-- intentional since the view itself already strips the sensitive columns;
-- GRANT still limits it to logged-in users only.
create or replace view households_public as
select id, unit_no, is_active from households;
grant select on households_public to authenticated;

create or replace view payments_public as
select household_id, period_year, period_month, amount
from payments
where status = 'confirmed';
grant select on payments_public to authenticated;

-- Community expenses (Pengeluaran) — e.g. keamanan, kebersihan, perbaikan.
-- Not tied to a household, so no privacy concern reading it: any
-- authenticated user (warga included) can see the full history, but only
-- pengurus can record one.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  description text not null,
  amount numeric(12,2) not null,
  recorded_by text,                -- email of the pengurus who entered it
  created_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on expenses (expense_date);

alter table expenses enable row level security;

drop policy if exists "authenticated read expenses" on expenses;
create policy "authenticated read expenses" on expenses
  for select to authenticated using (true);

drop policy if exists "pengurus write expenses" on expenses;
create policy "pengurus write expenses" on expenses
  for all to authenticated using (is_pengurus()) with check (is_pengurus());
