-- Membership, with history: leaving sets `is_active = false` and `left_at`; rows are never deleted.
-- Rejoining the same team reactivates the same row (one row per team and player).
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  user_id text not null references public.profiles (id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 16),
  role text not null default 'member' check (role in ('creator', 'host', 'member')),
  is_ready boolean not null default false,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (team_id, user_id),
  check (is_active = (left_at is null))
);

-- A player is in at most one team at a time.
create unique index if not exists team_members_one_active_team_idx on public.team_members (user_id) where is_active;
create index if not exists team_members_user_id_idx on public.team_members (user_id);
create index if not exists team_members_team_active_idx on public.team_members (team_id) where is_active;
