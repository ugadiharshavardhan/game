-- One shared village per round. A team has at most one open session (lobby or in progress);
-- finished rounds stay as history. The moon is fully determined by `moon_seed` and `started_at`,
-- so every client computes the same moon cycle without it ever being synced.
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  created_by text not null references public.profiles (id) on delete restrict,
  status text not null default 'lobby' check (status in ('lobby', 'in_progress', 'completed', 'abandoned')),
  moon_seed integer not null default floor(random() * 100000)::integer check (moon_seed between 0 and 99999),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (status = 'lobby' or started_at is not null or status = 'abandoned'),
  check ((status in ('completed', 'abandoned')) = (ended_at is not null))
);

create unique index if not exists game_sessions_one_open_per_team_idx
  on public.game_sessions (team_id) where status in ('lobby', 'in_progress');
create index if not exists game_sessions_team_id_idx on public.game_sessions (team_id, created_at desc);
create index if not exists game_sessions_created_by_idx on public.game_sessions (created_by);
