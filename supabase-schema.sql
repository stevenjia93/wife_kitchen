create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_states (
  household_id uuid primary key references public.households(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_states enable row level security;

grant usage on schema public to authenticated;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update on public.household_states to authenticated;

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.join_household_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(p_code));
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_code = '' then
    raise exception 'Household code is required';
  end if;

  select id
    into v_household_id
    from public.households
   where code = v_code;

  if v_household_id is null then
    insert into public.households (code, created_by)
    values (v_code, auth.uid())
    returning id into v_household_id;
  end if;

  insert into public.household_members (household_id, user_id)
  values (v_household_id, auth.uid())
  on conflict do nothing;

  insert into public.household_states (household_id, payload)
  values (v_household_id, '{}'::jsonb)
  on conflict do nothing;

  return v_household_id;
end;
$$;

drop policy if exists "members can read households" on public.households;
create policy "members can read households"
on public.households
for select
using (public.is_household_member(id));

drop policy if exists "members can read memberships" on public.household_members;
create policy "members can read memberships"
on public.household_members
for select
using (user_id = auth.uid() or public.is_household_member(household_id));

drop policy if exists "members can read state" on public.household_states;
create policy "members can read state"
on public.household_states
for select
using (public.is_household_member(household_id));

drop policy if exists "members can insert state" on public.household_states;
create policy "members can insert state"
on public.household_states
for insert
with check (public.is_household_member(household_id));

drop policy if exists "members can update state" on public.household_states;
create policy "members can update state"
on public.household_states
for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

grant execute on function public.join_household_by_code(text) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.household_states;
  exception
    when duplicate_object then null;
  end;
end $$;
