create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  wechat_openid text not null unique,
  wechat_unionid text unique,
  display_name text not null default '微信用户',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table households
  add column if not exists name text,
  add column if not exists owner_user_id uuid references users(id) on delete set null;

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_id_idx
  on household_members (user_id, joined_at desc);

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists user_sessions_user_id_idx
  on user_sessions (user_id, expires_at desc);

create table if not exists household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references users(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  max_uses integer not null default 5 check (max_uses between 1 and 20),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists household_invitations_household_id_idx
  on household_invitations (household_id, created_at desc);
