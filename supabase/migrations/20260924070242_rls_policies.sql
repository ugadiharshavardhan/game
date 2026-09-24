-- Row Level Security. Clients may only READ, and only what belongs to their own teams; every write
-- goes through the RPCs in the next migration, which check identity, membership and the rules
-- before touching a row. There are deliberately no insert/update/delete policies.

-- Membership checks for policies. SECURITY DEFINER so the check on team_members does not recurse
-- through team_members' own policy; they only ever answer for the calling user.
create or replace function private.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and m.user_id = private.uid()
  )
$$;

create or replace function private.is_active_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and m.user_id = private.uid() and m.is_active
  )
$$;

create or replace function private.shares_team(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members mine
    join public.team_members theirs on theirs.team_id = mine.team_id
    where mine.user_id = private.uid() and theirs.user_id = p_user_id
  )
$$;

revoke all on all functions in schema private from public;
grant execute on function private.uid() to authenticated;
grant execute on function private.is_team_member(uuid) to authenticated;
grant execute on function private.is_active_team_member(uuid) to authenticated;
grant execute on function private.shares_team(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.player_game_results enable row level security;
alter table public.team_results enable row level security;

-- Least privilege at the grant level too: nothing for anon, SELECT only for signed-in players.
revoke all on public.profiles, public.teams, public.team_members, public.game_sessions,
  public.session_players, public.player_game_results, public.team_results from anon, authenticated;
grant select on public.profiles, public.teams, public.team_members, public.game_sessions,
  public.session_players, public.player_game_results, public.team_results to authenticated;

create policy "Players read their own profile and their teammates'"
  on public.profiles for select to authenticated
  using (id = (select private.uid()) or private.shares_team(id));

create policy "Members read their teams"
  on public.teams for select to authenticated
  using (private.is_team_member(id));

create policy "Members read their teams' members"
  on public.team_members for select to authenticated
  using (private.is_team_member(team_id));

create policy "Members read their teams' sessions"
  on public.game_sessions for select to authenticated
  using (private.is_team_member(team_id));

create policy "Members read their teams' session rosters"
  on public.session_players for select to authenticated
  using (private.is_team_member(team_id));

create policy "Players read their own results and their teams' results"
  on public.player_game_results for select to authenticated
  using (user_id = (select private.uid()) or (team_id is not null and private.is_team_member(team_id)));

create policy "Members read their teams' results"
  on public.team_results for select to authenticated
  using (private.is_team_member(team_id));
