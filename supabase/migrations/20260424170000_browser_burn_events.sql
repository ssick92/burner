create table if not exists public.browser_burn_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('anonymous-browser', 'local-fallback')),
  track_count integer not null check (track_count > 0 and track_count <= 30),
  has_cover boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists browser_burn_events_created_at_idx
  on public.browser_burn_events (created_at desc);

alter table public.browser_burn_events enable row level security;
