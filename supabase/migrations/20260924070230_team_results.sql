-- One row per team round, recalculated from `player_game_results` whenever a member's run is
-- accepted, and marked final when nobody in the round is still playing.
create table if not exists public.team_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  session_id uuid not null unique references public.game_sessions (id) on delete restrict,
  team_score integer not null default 0,
  completed_players smallint not null default 0 check (completed_players >= 0),
  submitted_players smallint not null default 0 check (submitted_players >= 0),
  team_completion_time_ms integer check (team_completion_time_ms >= 0),
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  calculated_at timestamptz not null default now()
);

create index if not exists team_results_team_best_idx on public.team_results (team_id, team_score desc);
