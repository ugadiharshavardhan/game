-- Teams. `creator_id` is permanent; `host_id` is whoever currently runs the lobby (it moves to the
-- longest-standing member if the host leaves). Teams are closed, never deleted.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_name text not null check (char_length(team_name) between 1 and 24),
  team_code text not null unique check (team_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  creator_id text not null references public.profiles (id) on delete restrict,
  host_id text not null references public.profiles (id) on delete restrict,
  max_members smallint not null default 4 check (max_members between 1 and 4),
  status text not null default 'waiting' check (status in ('waiting', 'in_game', 'closed')),
  is_active boolean generated always as (status <> 'closed') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'closed') = (closed_at is not null))
);

-- team_code already has a unique index from its constraint.
create index if not exists teams_creator_id_idx on public.teams (creator_id);
create index if not exists teams_host_id_idx on public.teams (host_id);

create trigger teams_set_updated_at
  before update on public.teams
  for each row
  execute function private.set_updated_at();
