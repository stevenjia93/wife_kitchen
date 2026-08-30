create table if not exists household_ai_usage_daily (
  household_id uuid not null references households(id) on delete cascade,
  usage_date date not null,
  photo_analysis_count integer not null default 0 check (photo_analysis_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, usage_date)
);

create index if not exists household_ai_usage_daily_date_idx
  on household_ai_usage_daily (usage_date desc);
