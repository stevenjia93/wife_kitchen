create extension if not exists pgcrypto;

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists household_states (
  household_id uuid primary key references households(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists household_states_updated_at_idx
  on household_states (updated_at desc);
