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
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  amount numeric(12,2) not null,
  paid_date date not null default current_date,
  note text,
  recorded_by text,                -- email of the admin who entered it
  created_at timestamptz not null default now(),
  unique (household_id, period_year, period_month)
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text,
  action text not null,            -- e.g. "payment.create", "household.create"
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists payments_period_idx on payments (period_year, period_month);
create index if not exists payments_household_idx on payments (household_id);

-- Row Level Security: only authenticated users (i.e. the 1-2 admins who log
-- in) can read/write. There is no public sign-up flow in the app, so create
-- admin accounts manually in Supabase Auth (see README).
alter table settings enable row level security;
alter table households enable row level security;
alter table payments enable row level security;
alter table activity_log enable row level security;

create policy "authenticated read settings" on settings
  for select to authenticated using (true);
create policy "authenticated write settings" on settings
  for update to authenticated using (true) with check (true);

create policy "authenticated all households" on households
  for all to authenticated using (true) with check (true);

create policy "authenticated all payments" on payments
  for all to authenticated using (true) with check (true);

create policy "authenticated all activity_log" on activity_log
  for all to authenticated using (true) with check (true);
