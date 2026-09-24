-- The roster of a round, written when the host starts it. Live position and online state go over
-- Realtime; this keeps only what the round needs to remember.
--   playing   — in the village (or expected back after a refresh)
--   completed — submitted a run that finished the puja
--   dnf       — submitted a run that dawn ended
--   abandoned — quit, left the team, or went silent
create table if not exists public.session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete restrict,
  team_id uuid not null references public.teams (id) on delete restrict,
  user_id text not null references public.profiles (id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 16),
  is_ready boolean not null default true,
  is_connected boolean not null default true,
  completion_state text not null default 'playing' check (completion_state in ('playing', 'completed', 'dnf', 'abandoned')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (session_id, user_id)
);

-- session_id is covered by the unique constraint's index.
create index if not exists session_players_user_id_idx on public.session_players (user_id);
create index if not exists session_players_team_id_idx on public.session_players (team_id);
