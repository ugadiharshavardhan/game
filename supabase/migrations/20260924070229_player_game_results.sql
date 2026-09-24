-- Every accepted run, solo or team. Never overwritten: the leaderboard picks each player's best.
-- `score` and `breakdown` are computed in the database from the stats; `client_score` is only
-- kept to notice a client that disagrees. `is_valid` lets an organiser hide a run without
-- deleting it.
create table if not exists public.player_game_results (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete restrict,
  team_id uuid references public.teams (id) on delete restrict,
  session_id uuid references public.game_sessions (id) on delete restrict,
  score integer not null,
  breakdown jsonb not null,
  client_score integer,
  completion_time_ms integer not null check (completion_time_ms >= 0),
  items_required smallint not null check (items_required >= 0),
  items_collected smallint not null check (items_collected >= 0),
  items_lost smallint not null default 0 check (items_lost >= 0),
  moonlight_exposure numeric(5, 2) not null default 0 check (moonlight_exposure between 0 and 100),
  exposed_seconds numeric(8, 2) not null default 0 check (exposed_seconds >= 0),
  moonlight_encounters smallint not null default 0 check (moonlight_encounters >= 0),
  shelters_used smallint not null default 0 check (shelters_used >= 0),
  overwhelmed smallint not null default 0 check (overwhelmed >= 0),
  distance_m numeric(10, 2) not null default 0 check (distance_m >= 0),
  completed boolean not null default false,
  is_valid boolean not null default true,
  created_at timestamptz not null default now(),
  check ((team_id is null) = (session_id is null))
);

-- One counted run per player per team round.
create unique index if not exists player_game_results_session_user_idx
  on public.player_game_results (session_id, user_id) where session_id is not null;
create index if not exists player_game_results_user_best_idx
  on public.player_game_results (user_id, score desc, completion_time_ms) where is_valid;
create index if not exists player_game_results_user_created_idx on public.player_game_results (user_id, created_at desc);
create index if not exists player_game_results_team_id_idx on public.player_game_results (team_id);
