create table if not exists household_meal_photos (
  household_id uuid not null references households(id) on delete cascade,
  date_key date not null,
  photo_id text not null check (char_length(photo_id) between 8 and 120),
  original_image bytea not null,
  original_mime text not null default 'image/jpeg',
  analysis jsonb,
  share_task_id text,
  share_status text not null default 'idle'
    check (share_status in ('idle', 'PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN')),
  share_image bytea,
  share_mime text,
  share_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, date_key)
);

create index if not exists household_meal_photos_updated_at_idx
  on household_meal_photos (household_id, updated_at desc);
