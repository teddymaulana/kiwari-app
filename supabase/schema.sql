-- IPL / Iuran app schema
-- Run this in the Supabase SQL editor (Project > SQL Editor > New query)

create extension if not exists "pgcrypto";

-- One row: the current monthly fee. Kept as a table (not hardcoded) so the
-- treasurer can update it from the Settings page without touching code.
create table if not exists settings (
  id int primary key default 1,
  monthly_amount numeric(12,2) not null default 50000,
  -- Kas balance carried over from before this app tracked payments/
  -- expenses individually — added to the running totals on /report so
  -- "Kas Saat Ini" reflects the real treasury, not just what's been
  -- recorded here. Split by kas_type like everything else (see
  -- payments.kas_type below).
  opening_balance_bri numeric(12,2) not null default 0,
  opening_balance_tunai numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);
insert into settings (id, monthly_amount) values (1, 50000)
  on conflict (id) do nothing;

alter table settings add column if not exists opening_balance_bri numeric(12,2) not null default 0;
alter table settings add column if not exists opening_balance_tunai numeric(12,2) not null default 0;

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
  -- Which physical kas the money landed in: 'tunai' (petty cash, held by
  -- pengurus) or 'bri' (the household's bank BRI account). Defaults to
  -- 'bri' since most residents pay by transfer; a minority still pay cash
  -- in person. Self-submitted "Bayar IPL" claims (paymentClaim.ts) always
  -- set this to 'bri' explicitly since they require a transfer receipt.
  kas_type text not null default 'bri' check (kas_type in ('tunai', 'bri')),
  created_at timestamptz not null default now(),
  unique (household_id, period_year, period_month)
);

alter table payments add column if not exists status text
  not null default 'confirmed' check (status in ('pending', 'confirmed'));
alter table payments add column if not exists receipt_path text;
alter table payments add column if not exists kas_type text
  not null default 'bri' check (kas_type in ('tunai', 'bri'));

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
select household_id, period_year, period_month, amount, kas_type
from payments
where status = 'confirmed';
grant select on payments_public to authenticated;

-- Other income collected from residents beyond the recurring monthly IPL —
-- one-off contributions tied to a specific event (e.g. "Sumbangan Agustus
-- 2026", "Sumbangan HUT RI"). event_name is free text since these aren't a
-- fixed set of categories and the amount isn't a fixed nominal like
-- monthly_amount. No unique constraint (unlike payments) — a household can
-- contribute to the same event more than once. Same privacy treatment as
-- payments: pengurus see everything, warga only their own household's rows
-- — plus, unlike payments, a contribution can come from outside any
-- household (e.g. "Sumbangan Developer", RW/RT), in which case household_id
-- is null and source_name carries the free-text label instead. Those rows
-- are visible to everyone (no household to keep private). The app enforces
-- "at least one of household_id / source_name is set" — not a DB
-- constraint, to keep this alterable without a guarded migration.
create table if not exists contributions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  source_name text,                -- used instead of household_id for a non-resident source
  event_name text not null,
  amount numeric(12,2) not null,
  contribution_date date not null default current_date,
  note text,
  recorded_by text,                -- email of the pengurus who entered it
  kas_type text not null default 'bri' check (kas_type in ('tunai', 'bri')),
  created_at timestamptz not null default now()
);

create index if not exists contributions_household_idx on contributions (household_id);
create index if not exists contributions_date_idx on contributions (contribution_date);

alter table contributions alter column household_id drop not null;
alter table contributions add column if not exists source_name text;

alter table contributions enable row level security;

drop policy if exists "authenticated read contributions" on contributions;
create policy "authenticated read contributions" on contributions
  for select to authenticated using (
    is_pengurus() or household_id = my_household_id() or household_id is null
  );

drop policy if exists "pengurus write contributions" on contributions;
create policy "pengurus write contributions" on contributions
  for all to authenticated using (is_pengurus()) with check (is_pengurus());

-- Public-safe cut for the Sumbangan page (Warga x Acara grid + Lain-lain
-- list) and Laporan's Kas Saat Ini/yearly totals — same treatment as
-- payments_public above: strips notes and who-recorded-it, but keeps
-- event_name/source_name since neither is sensitive (they're what makes
-- the community-wide grid and Lain-lain list meaningful for warga too).
--
-- Dropped and recreated rather than "create or replace" — Postgres won't
-- let create-or-replace reorder/insert columns ahead of existing ones
-- (source_name/event_name land before amount here), only append at the
-- end, so replace alone errors on an already-existing older version of
-- this view.
drop view if exists contributions_public;
create view contributions_public as
select household_id, source_name, event_name, amount, kas_type, contribution_date
from contributions;
grant select on contributions_public to authenticated;

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
  -- Which kas the expense was paid out of — see payments.kas_type.
  kas_type text not null default 'bri' check (kas_type in ('tunai', 'bri')),
  created_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on expenses (expense_date);

alter table expenses add column if not exists kas_type text
  not null default 'bri' check (kas_type in ('tunai', 'bri'));

alter table expenses enable row level security;

drop policy if exists "authenticated read expenses" on expenses;
create policy "authenticated read expenses" on expenses
  for select to authenticated using (true);

drop policy if exists "pengurus write expenses" on expenses;
create policy "pengurus write expenses" on expenses
  for all to authenticated using (is_pengurus()) with check (is_pengurus());

-- Internal moves of money between the two kas — e.g. the treasurer
-- withdraws cash from the bank BRI account to top up petty cash on hand
-- (direction 'bri_to_tunai'), or deposits leftover cash back into the
-- bank (direction 'tunai_to_bri'). Not income or an expense — the total
-- treasury balance is unchanged, only the split between the two kas
-- moves. Read is open to any authenticated user (same transparency as
-- expenses); only pengurus can record one.
create table if not exists cash_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null default current_date,
  amount numeric(12,2) not null,
  direction text not null check (direction in ('bri_to_tunai', 'tunai_to_bri')),
  note text,
  recorded_by text,                -- email of the pengurus who entered it
  created_at timestamptz not null default now()
);

create index if not exists cash_transfers_date_idx on cash_transfers (transfer_date);

alter table cash_transfers enable row level security;

drop policy if exists "authenticated read cash_transfers" on cash_transfers;
create policy "authenticated read cash_transfers" on cash_transfers
  for select to authenticated using (true);

drop policy if exists "pengurus write cash_transfers" on cash_transfers;
create policy "pengurus write cash_transfers" on cash_transfers
  for all to authenticated using (is_pengurus()) with check (is_pengurus());

-- Loans (hutang/piutang) the kas has extended to personnel, and
-- their repayments — a running per-person receivable ("Piutang"). Giving a
-- loan is normally real cash leaving Kas BRI/Tunai (same treatment as an
-- expense, via kas_type), and a repayment is cash coming back in — so
-- both normally feed into the Kas Tunai/Kas BRI totals on /report exactly
-- like expenses do. affects_kas is the escape hatch for a loan that
-- predates this app's tracking (the cash already left the kas before any
-- opening balance/expense was recorded here) — set it false so the
-- outstanding amount still counts in the Piutang total without being
-- double-subtracted from Kas Saat Ini. The Piutang page always inserts
-- affects_kas = true; false is only ever set via a one-off backfill script.
-- The outstanding total itself ("Piutang Personel") is shown as separate
-- info on /report, deliberately never summed into "Kas Saat Ini" — it
-- isn't liquid cash, it's money owed back. Same transparency as expenses:
-- any authenticated user can read the full history, only pengurus can
-- record.
create table if not exists personnel_loans (
  id uuid primary key default gen_random_uuid(),
  person_name text not null,
  amount numeric(12,2) not null,
  transaction_type text not null check (transaction_type in ('pinjam', 'bayar')),
  transaction_date date not null default current_date,
  kas_type text not null default 'bri' check (kas_type in ('tunai', 'bri')),
  affects_kas boolean not null default true,
  note text,
  recorded_by text,                -- email of the pengurus who entered it
  created_at timestamptz not null default now()
);

create index if not exists personnel_loans_person_idx on personnel_loans (person_name);
create index if not exists personnel_loans_date_idx on personnel_loans (transaction_date);

alter table personnel_loans add column if not exists affects_kas boolean not null default true;

alter table personnel_loans enable row level security;

drop policy if exists "authenticated read personnel_loans" on personnel_loans;
create policy "authenticated read personnel_loans" on personnel_loans
  for select to authenticated using (true);

drop policy if exists "pengurus write personnel_loans" on personnel_loans;
create policy "pengurus write personnel_loans" on personnel_loans
  for all to authenticated using (is_pengurus()) with check (is_pengurus());
