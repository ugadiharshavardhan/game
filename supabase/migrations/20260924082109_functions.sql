-- The team service. Every write the game makes is one of these functions, each a single
-- transaction: it either succeeds completely or raises and leaves nothing behind.
--
-- They are SECURITY DEFINER because they write rows the caller has no policy to write, so each one
-- starts from the verified JWT (`private.uid()`) and checks membership and the rules itself.
-- Errors are raised as SQLSTATE P0001 with a stable code in the message (TEAM_FULL, …) that the
-- client turns into a sentence; nothing internal reaches the player.

-- ---- helpers -----------------------------------------------------------------------------------

create or replace function private.fail(p_code text, p_detail text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = coalesce(p_detail, '');
end;
$$;

create or replace function private.clean_text(p_raw text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(left(btrim(regexp_replace(coalesce(p_raw, ''), '\s+', ' ', 'g')), p_max))
$$;

create or replace function private.normalise_team_code(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_raw, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function private.require_uid()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid text := private.uid();
begin
  if v_uid is null then
    perform private.fail('NOT_AUTHENTICATED');
  end if;
  return v_uid;
end;
$$;

create or replace function private.require_profile()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  update public.profiles set last_active_at = now()
  where id = private.require_uid()
  returning * into v_profile;
  if not found then
    perform private.fail('PROFILE_REQUIRED');
  end if;
  return v_profile;
end;
$$;

create or replace function private.lock_user(p_uid text)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('moonlight-seva:user:' || p_uid, 0))
$$;

-- Everything a lobby needs, in one read: the team, its active members, its current (or most
-- recent) round with its roster and results.
create or replace function private.team_snapshot(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select * from public.teams where id = p_team_id
  ),
  s as (
    select * from public.game_sessions
    where team_id = p_team_id
    order by (status in ('lobby', 'in_progress')) desc, created_at desc
    limit 1
  )
  select jsonb_build_object(
    'server_time', now(),
    'team', (
      select jsonb_build_object(
        'id', t.id,
        'team_name', t.team_name,
        'team_code', t.team_code,
        'creator_id', t.creator_id,
        'creator_name', (select p.display_name from public.profiles p where p.id = t.creator_id),
        'host_id', t.host_id,
        'status', t.status,
        'max_members', t.max_members,
        'is_active', t.is_active,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) from t
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'display_name', m.display_name,
        'role', m.role,
        'is_ready', m.is_ready,
        'joined_at', m.joined_at
      ) order by m.joined_at)
      from public.team_members m
      where m.team_id = p_team_id and m.is_active
    ), '[]'::jsonb),
    'session', (
      select jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'moon_seed', s.moon_seed,
        'created_by', s.created_by,
        'started_at', s.started_at,
        'ended_at', s.ended_at,
        'created_at', s.created_at
      ) from s
    ),
    'session_players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', sp.user_id,
        'display_name', sp.display_name,
        'completion_state', sp.completion_state,
        'is_connected', sp.is_connected,
        'joined_at', sp.joined_at,
        'last_seen_at', sp.last_seen_at,
        'score', r.score,
        'completion_time_ms', r.completion_time_ms,
        'completed', r.completed
      ) order by sp.joined_at)
      from s
      join public.session_players sp on sp.session_id = s.id
      left join public.player_game_results r on r.session_id = s.id and r.user_id = sp.user_id
    ), '[]'::jsonb),
    'team_result', (
      select jsonb_build_object(
        'team_score', tr.team_score,
        'completed_players', tr.completed_players,
        'submitted_players', tr.submitted_players,
        'team_completion_time_ms', tr.team_completion_time_ms,
        'is_final', tr.is_final,
        'calculated_at', tr.calculated_at
      )
      from s join public.team_results tr on tr.session_id = s.id
    )
  )
$$;

-- ---- scoring: the database's copy of src/shared/score.ts ---------------------------------------

create or replace function private.stat(p_stats jsonb, p_key text)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_stats -> p_key) = 'number' then (p_stats ->> p_key)::double precision end
$$;

-- Returns why these stats could not have happened, or null. Mirrors validateStats().
create or replace function private.validate_run(p_stats jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v double precision;
  v_seconds double precision;
begin
  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then
    return 'stats missing';
  end if;
  foreach k in array array['itemsCollected', 'itemsLost', 'shelterEvents', 'moonlightEncounters', 'overwhelmed',
                           'durationMs', 'distanceTravelled', 'exposedSeconds'] loop
    v := private.stat(p_stats, k);
    if v is null or v < 0 or v = 'Infinity'::double precision then
      return k || ' is not a real number';
    end if;
  end loop;
  if jsonb_typeof(p_stats -> 'pujaComplete') <> 'boolean' then
    return 'pujaComplete is not a flag';
  end if;
  v_seconds := private.stat(p_stats, 'durationMs') / 1000;
  if (p_stats ->> 'pujaComplete')::boolean and private.stat(p_stats, 'itemsCollected') < 25 then return 'the puja was not completed'; end if;
  if private.stat(p_stats, 'itemsCollected') > 200 then return 'more offerings than the village holds'; end if;
  if v_seconds < 90 then return 'finished faster than the village can be walked'; end if;
  if v_seconds > 7200 then return 'longer than a night'; end if;
  if (p_stats ->> 'pujaComplete')::boolean and private.stat(p_stats, 'distanceTravelled') < 250 then return 'the offerings are further apart than that'; end if;
  if private.stat(p_stats, 'distanceTravelled') > 60000 then return 'further than anyone walks in a night'; end if;
  if private.stat(p_stats, 'shelterEvents') > 60 then return 'more doors than there are'; end if;
  if private.stat(p_stats, 'overwhelmed') > 60 then return 'caught out too many times to be a run'; end if;
  if private.stat(p_stats, 'itemsLost') > 200 or private.stat(p_stats, 'moonlightEncounters') > 200 then return 'more than a night holds'; end if;
  if private.stat(p_stats, 'exposedSeconds') > v_seconds then return 'more time in the moonlight than in the run'; end if;
  return null;
end;
$$;

-- Mirrors scoreRun() with DEFAULT_SCORE_WEIGHTS, in double precision like JavaScript.
create or replace function private.score_run(p_stats jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_items double precision := floor(private.stat(p_stats, 'itemsCollected'));
  v_distance double precision := private.stat(p_stats, 'distanceTravelled');
  v_seconds double precision := private.stat(p_stats, 'durationMs') / 1000;
  v_done boolean := (p_stats ->> 'pujaComplete')::boolean;
  v_efficiency double precision;
  b_items integer;
  b_shelter integer;
  b_efficiency integer;
  b_completion integer;
  b_time integer;
  b_penalties integer;
begin
  v_efficiency := case when v_distance > 0 then least(900 / v_distance, 1) else 1 end;
  b_items := (v_items * 40)::integer;
  b_shelter := (floor(private.stat(p_stats, 'shelterEvents')) * 250)::integer;
  b_efficiency := round((v_efficiency * 1000 * least(v_items / 25, 1))::numeric)::integer;
  b_completion := case when v_done then 1200 else 0 end;
  b_time := case when v_done then least(greatest(0, round(((600 - v_seconds) * 3)::numeric)), 600)::integer else 0 end;
  b_penalties := -(floor(private.stat(p_stats, 'itemsLost')) * 25 + floor(private.stat(p_stats, 'overwhelmed')) * 50)::integer;
  return jsonb_build_object(
    'items', b_items,
    'shelter', b_shelter,
    'efficiency', b_efficiency,
    'completion', b_completion,
    'timeBonus', b_time,
    'penalties', b_penalties,
    'total', b_items + b_shelter + b_efficiency + b_completion + b_time + b_penalties
  );
end;
$$;

-- ---- rounds and results ------------------------------------------------------------------------

create or replace function private.recalculate_team_result(p_session_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.team_results as tr (team_id, session_id, team_score, completed_players, submitted_players, team_completion_time_ms, calculated_at)
  select s.team_id,
         s.id,
         coalesce(sum(r.score), 0),
         count(r.id) filter (where r.completed),
         count(r.id),
         max(r.completion_time_ms) filter (where r.completed),
         now()
  from public.game_sessions s
  join public.player_game_results r on r.session_id = s.id and r.is_valid
  where s.id = p_session_id
  group by s.id, s.team_id
  on conflict (session_id) do update set
    team_score = excluded.team_score,
    completed_players = excluded.completed_players,
    submitted_players = excluded.submitted_players,
    team_completion_time_ms = excluded.team_completion_time_ms,
    calculated_at = excluded.calculated_at
$$;

-- Closes a round once nobody in it is still playing: final team result, team back to its lobby.
create or replace function private.maybe_complete_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_sessions;
  v_results integer;
begin
  select * into v_session from public.game_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'in_progress' then
    return;
  end if;
  if exists (select 1 from public.session_players where session_id = p_session_id and completion_state = 'playing') then
    return;
  end if;
  select count(*) into v_results from public.player_game_results where session_id = p_session_id and is_valid;
  if v_results > 0 then
    perform private.recalculate_team_result(p_session_id);
    update public.team_results set is_final = true where session_id = p_session_id;
    update public.game_sessions set status = 'completed', ended_at = now() where id = p_session_id;
  else
    update public.game_sessions set status = 'abandoned', ended_at = now() where id = p_session_id;
  end if;
  update public.teams set status = 'waiting' where id = v_session.team_id and status = 'in_game';
  update public.team_members set is_ready = false where team_id = v_session.team_id and is_active and is_ready;
end;
$$;

create or replace function private.individual_rank(p_user_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.score, r.completion_time_ms, r.created_at
    from public.player_game_results r
    where r.is_valid
    order by r.user_id, r.score desc, r.completion_time_ms asc, r.created_at asc
  ),
  ranked as (
    select user_id, row_number() over (order by score desc, completion_time_ms asc, created_at asc) as rank
    from best
  )
  select rank::integer from ranked where user_id = p_user_id
$$;

create or replace function private.team_rank(p_team_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (tr.team_id) tr.team_id, tr.team_score, tr.team_completion_time_ms, tr.calculated_at
    from public.team_results tr
    where tr.submitted_players > 0
    order by tr.team_id, tr.team_score desc, tr.team_completion_time_ms asc nulls last, tr.calculated_at asc
  ),
  ranked as (
    select team_id, row_number() over (order by team_score desc, team_completion_time_ms asc nulls last, calculated_at asc) as rank
    from best
  )
  select rank::integer from ranked where team_id = p_team_id
$$;

-- ---- profiles ----------------------------------------------------------------------------------

create or replace function public.ensure_profile(p_display_name text, p_campus text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := private.require_uid();
  v_name text := private.clean_text(p_display_name, 16);
  v_campus text := private.clean_text(p_campus, 24);
  v_base text;
  v_profile public.profiles;
begin
  if v_name = '' then
    perform private.fail('BAD_NAME');
  end if;

  update public.profiles
  set display_name = v_name, campus = v_campus, last_active_at = now()
  where id = v_uid
  returning * into v_profile;

  if not found then
    v_base := btrim(left(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), 20), '_');
    if char_length(v_base) < 3 then
      v_base := 'player';
    end if;
    for i in 1..10 loop
      begin
        insert into public.profiles (id, username, display_name, campus)
        values (v_uid, v_base || '_' || lower(private.random_code(4)), v_name, v_campus)
        on conflict (id) do update set display_name = excluded.display_name, campus = excluded.campus, last_active_at = now()
        returning * into v_profile;
        exit;
      exception when unique_violation then
        if i = 10 then
          perform private.fail('PROFILE_FAILED');
        end if;
      end;
    end loop;
  end if;

  -- The lobby shows the name a player goes by now.
  update public.team_members set display_name = v_name where user_id = v_uid and is_active and display_name <> v_name;

  return jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'campus', v_profile.campus,
    'created_at', v_profile.created_at,
    'last_active_at', v_profile.last_active_at
  );
end;
$$;

-- ---- teams -------------------------------------------------------------------------------------

create or replace function public.create_team(p_team_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := private.require_profile();
  v_name text := private.clean_text(p_team_name, 24);
  v_team_id uuid;
begin
  perform private.lock_user(v_profile.id);
  if exists (select 1 from public.team_members where user_id = v_profile.id and is_active) then
    perform private.fail('ALREADY_IN_TEAM');
  end if;
  if v_name = '' then
    v_name := private.clean_text(v_profile.display_name || '''s team', 24);
  end if;

  -- The unique constraint on team_code is the real guarantee; a collision just draws again.
  for i in 1..10 loop
    begin
      insert into public.teams (team_name, team_code, creator_id, host_id)
      values (v_name, private.random_code(6), v_profile.id, v_profile.id)
      returning id into v_team_id;
      exit;
    exception when unique_violation then
      if i = 10 then
        perform private.fail('CODE_GENERATION_FAILED');
      end if;
    end;
  end loop;

  insert into public.team_members (team_id, user_id, display_name, role)
  values (v_team_id, v_profile.id, v_profile.display_name, 'creator');

  insert into public.game_sessions (team_id, created_by)
  values (v_team_id, v_profile.id);

  return private.team_snapshot(v_team_id);
exception when unique_violation then
  -- Only the one-active-team index can still collide: a second tab created or joined at once.
  perform private.fail('ALREADY_IN_TEAM');
end;
$$;

create or replace function public.get_team_by_code(p_team_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := private.normalise_team_code(p_team_code);
  v_team public.teams;
begin
  perform private.require_uid();
  select * into v_team from public.teams where team_code = v_code;
  if not found then
    perform private.fail('TEAM_NOT_FOUND');
  end if;
  return jsonb_build_object(
    'team_name', v_team.team_name,
    'team_code', v_team.team_code,
    'status', v_team.status,
    'max_members', v_team.max_members,
    'member_count', (select count(*) from public.team_members where team_id = v_team.id and is_active),
    'creator_name', (select display_name from public.profiles where id = v_team.creator_id)
  );
end;
$$;

create or replace function public.join_team(p_team_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := private.require_profile();
  v_code text := private.normalise_team_code(p_team_code);
  v_team public.teams;
  v_member public.team_members;
  v_count integer;
begin
  if v_code !~ '^[A-Z0-9]{6}$' then
    perform private.fail('TEAM_NOT_FOUND');
  end if;
  perform private.lock_user(v_profile.id);

  -- The row lock serialises every join into this team, so the capacity check below cannot race.
  select * into v_team from public.teams where team_code = v_code for update;
  if not found then
    perform private.fail('TEAM_NOT_FOUND');
  end if;
  if v_team.status = 'closed' then
    perform private.fail('TEAM_CLOSED');
  end if;

  select * into v_member from public.team_members where team_id = v_team.id and user_id = v_profile.id;
  if found and v_member.is_active then
    perform private.fail('ALREADY_MEMBER');
  end if;
  if exists (select 1 from public.team_members where user_id = v_profile.id and is_active) then
    perform private.fail('ALREADY_IN_TEAM');
  end if;
  if v_team.status = 'in_game' then
    perform private.fail('TEAM_STARTED');
  end if;
  select count(*) into v_count from public.team_members where team_id = v_team.id and is_active;
  if v_count >= v_team.max_members then
    perform private.fail('TEAM_FULL');
  end if;

  if v_member.id is not null then
    update public.team_members
    set is_active = true, left_at = null, joined_at = now(), is_ready = false, display_name = v_profile.display_name,
        role = case when role = 'creator' then 'creator' else 'member' end
    where id = v_member.id;
  else
    insert into public.team_members (team_id, user_id, display_name, role)
    values (v_team.id, v_profile.id, v_profile.display_name, 'member');
  end if;

  return private.team_snapshot(v_team.id);
exception when unique_violation then
  perform private.fail('ALREADY_IN_TEAM');
end;
$$;

create or replace function public.get_my_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from public.team_members where user_id = private.require_uid() and is_active;
  if v_team_id is null then
    return null;
  end if;
  return private.team_snapshot(v_team_id);
end;
$$;

-- Leaving keeps the history: the membership is closed, not deleted. If the host leaves, the
-- longest-standing member takes over; if nobody is left, the team is closed.
create or replace function public.leave_team()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := private.require_uid();
  v_member public.team_members;
  v_team public.teams;
  v_next text;
  v_session_id uuid;
begin
  perform private.lock_user(v_uid);
  select * into v_member from public.team_members where user_id = v_uid and is_active;
  if not found then
    perform private.fail('NOT_IN_TEAM');
  end if;
  select * into v_team from public.teams where id = v_member.team_id for update;

  update public.team_members set is_active = false, left_at = now(), is_ready = false where id = v_member.id;

  select id into v_session_id from public.game_sessions where team_id = v_team.id and status = 'in_progress';
  if v_session_id is not null then
    update public.session_players
    set completion_state = 'abandoned', is_connected = false, last_seen_at = now()
    where session_id = v_session_id and user_id = v_uid and completion_state = 'playing';
  end if;

  if v_team.host_id = v_uid then
    select user_id into v_next from public.team_members
    where team_id = v_team.id and is_active
    order by joined_at
    limit 1;
    if v_next is null then
      if v_session_id is not null then
        perform private.maybe_complete_session(v_session_id);
      end if;
      update public.game_sessions set status = 'abandoned', ended_at = now()
      where team_id = v_team.id and status in ('lobby', 'in_progress');
      update public.teams set status = 'closed', closed_at = now() where id = v_team.id;
      return;
    end if;
    update public.teams set host_id = v_next where id = v_team.id;
    update public.team_members set role = 'host' where team_id = v_team.id and user_id = v_next and role = 'member';
  end if;

  if v_session_id is not null then
    perform private.maybe_complete_session(v_session_id);
  end if;
end;
$$;

create or replace function public.set_ready(p_ready boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  update public.team_members set is_ready = coalesce(p_ready, false)
  where user_id = private.require_uid() and is_active
  returning team_id into v_team_id;
  if v_team_id is null then
    perform private.fail('NOT_IN_TEAM');
  end if;
  return private.team_snapshot(v_team_id);
end;
$$;

-- ---- rounds ------------------------------------------------------------------------------------

-- The host opens the village for everyone: the lobby session becomes the round, and every active
-- member is written into its roster.
create or replace function public.start_game()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := private.require_profile();
  v_team public.teams;
  v_session public.game_sessions;
  v_session_id uuid;
begin
  select t.* into v_team
  from public.teams t
  join public.team_members m on m.team_id = t.id
  where m.user_id = v_profile.id and m.is_active
  for update of t;
  if not found then
    perform private.fail('NOT_IN_TEAM');
  end if;
  if v_team.host_id <> v_profile.id then
    perform private.fail('NOT_HOST');
  end if;
  if exists (select 1 from public.team_members where team_id = v_team.id and is_active and not is_ready) then
    perform private.fail('NOT_EVERYONE_READY');
  end if;

  select * into v_session from public.game_sessions
  where team_id = v_team.id and status in ('lobby', 'in_progress')
  for update;

  if found and v_session.status = 'in_progress' then
    -- A player silent for two minutes has closed the tab; they no longer hold the round open.
    update public.session_players
    set completion_state = 'abandoned', is_connected = false
    where session_id = v_session.id and completion_state = 'playing' and last_seen_at < now() - interval '2 minutes';
    if exists (select 1 from public.session_players where session_id = v_session.id and completion_state = 'playing') then
      perform private.fail('SESSION_IN_PROGRESS');
    end if;
    perform private.maybe_complete_session(v_session.id);
  elsif found then
    v_session_id := v_session.id;
  end if;

  if v_session_id is not null then
    update public.game_sessions
    set status = 'in_progress', started_at = now(), moon_seed = floor(random() * 100000)::integer
    where id = v_session_id;
  else
    insert into public.game_sessions (team_id, created_by, status, started_at)
    values (v_team.id, v_profile.id, 'in_progress', now())
    returning id into v_session_id;
  end if;

  insert into public.session_players (session_id, team_id, user_id, display_name)
  select v_session_id, m.team_id, m.user_id, m.display_name
  from public.team_members m
  where m.team_id = v_team.id and m.is_active;

  update public.teams set status = 'in_game' where id = v_team.id;

  return private.team_snapshot(v_team.id);
end;
$$;

-- A low-frequency heartbeat while in the village (Realtime presence carries the live state).
create or replace function public.touch_session(p_session_id uuid, p_connected boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.session_players
  set is_connected = coalesce(p_connected, true), last_seen_at = now()
  where session_id = p_session_id and user_id = private.require_uid();
end;
$$;

-- Quitting a round without finishing it.
create or replace function public.leave_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := private.require_uid();
begin
  perform 1 from public.game_sessions where id = p_session_id for update;
  update public.session_players
  set completion_state = 'abandoned', is_connected = false, last_seen_at = now()
  where session_id = p_session_id and user_id = v_uid and completion_state = 'playing';
  if found then
    perform private.maybe_complete_session(p_session_id);
  end if;
end;
$$;

-- ---- results -----------------------------------------------------------------------------------

-- A finished run. The client sends what happened; the database checks it could have happened,
-- that the player really is in that round, and works out the score itself.
create or replace function public.submit_player_result(p_session_id uuid, p_stats jsonb, p_client_score integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := private.require_profile();
  v_reason text;
  v_session public.game_sessions;
  v_player public.session_players;
  v_breakdown jsonb;
  v_score integer;
  v_duration_ms integer;
  v_done boolean;
  v_result_id uuid;
  v_prev_best integer;
  v_team_score integer;
  v_team_rank integer;
begin
  perform private.lock_user(v_profile.id);

  v_reason := private.validate_run(p_stats);
  if v_reason is not null then
    perform private.fail('BAD_RUN', v_reason);
  end if;
  v_duration_ms := round(private.stat(p_stats, 'durationMs'))::integer;
  v_done := (p_stats ->> 'pujaComplete')::boolean;

  -- No real run is shorter than a minute and a half, so two within a minute is a script.
  if exists (select 1 from public.player_game_results where user_id = v_profile.id and created_at > now() - interval '60 seconds') then
    perform private.fail('RATE_LIMITED');
  end if;

  if p_session_id is not null then
    select * into v_session from public.game_sessions where id = p_session_id for update;
    if not found then
      perform private.fail('SESSION_NOT_FOUND');
    end if;
    select * into v_player from public.session_players where session_id = p_session_id and user_id = v_profile.id for update;
    if not found or v_player.completion_state = 'abandoned' then
      perform private.fail('NOT_IN_SESSION');
    end if;
    if v_player.completion_state <> 'playing' then
      perform private.fail('DUPLICATE_RUN');
    end if;
    if v_session.status <> 'in_progress' then
      perform private.fail('SESSION_CLOSED');
    end if;
    if v_duration_ms > extract(epoch from (now() - v_session.started_at)) * 1000 + 30000 then
      perform private.fail('BAD_RUN', 'longer than the round has been open');
    end if;
  end if;

  v_breakdown := private.score_run(p_stats);
  v_score := (v_breakdown ->> 'total')::integer;
  select max(score) into v_prev_best from public.player_game_results where user_id = v_profile.id and is_valid;

  insert into public.player_game_results (
    user_id, team_id, session_id, score, breakdown, client_score, completion_time_ms,
    items_required, items_collected, items_lost, moonlight_exposure, exposed_seconds,
    moonlight_encounters, shelters_used, overwhelmed, distance_m, completed
  ) values (
    v_profile.id, v_session.team_id, v_session.id, v_score, v_breakdown, p_client_score, v_duration_ms,
    25,
    floor(private.stat(p_stats, 'itemsCollected')),
    floor(private.stat(p_stats, 'itemsLost')),
    least(100, round((private.stat(p_stats, 'exposedSeconds') * 100000 / greatest(private.stat(p_stats, 'durationMs'), 1))::numeric, 2)),
    round(private.stat(p_stats, 'exposedSeconds')::numeric, 2),
    floor(private.stat(p_stats, 'moonlightEncounters')),
    floor(private.stat(p_stats, 'shelterEvents')),
    floor(private.stat(p_stats, 'overwhelmed')),
    round(private.stat(p_stats, 'distanceTravelled')::numeric, 2),
    v_done
  )
  returning id into v_result_id;

  if v_session.id is not null then
    update public.session_players
    set completion_state = case when v_done then 'completed' else 'dnf' end, is_connected = true, last_seen_at = now()
    where id = v_player.id;
    perform private.recalculate_team_result(v_session.id);
    perform private.maybe_complete_session(v_session.id);
    select team_score into v_team_score from public.team_results where session_id = v_session.id;
    v_team_rank := private.team_rank(v_session.team_id);
  end if;

  return jsonb_build_object(
    'result_id', v_result_id,
    'score', v_score,
    'breakdown', v_breakdown,
    'personal_best', v_prev_best is null or v_score > v_prev_best,
    'best_score', greatest(coalesce(v_prev_best, v_score), v_score),
    'individual_rank', private.individual_rank(v_profile.id),
    'team_score', v_team_score,
    'team_rank', v_team_rank
  );
end;
$$;

-- Recomputes a round's team result from the stored player results (never from a client number).
create or replace function public.finalize_team_result(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_sessions;
  v_result public.team_results;
begin
  perform private.require_uid();
  select * into v_session from public.game_sessions where id = p_session_id for update;
  if not found or not private.is_team_member(v_session.team_id) then
    perform private.fail('SESSION_NOT_FOUND');
  end if;
  perform private.recalculate_team_result(p_session_id);
  perform private.maybe_complete_session(p_session_id);
  select * into v_result from public.team_results where session_id = p_session_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'team_score', v_result.team_score,
    'completed_players', v_result.completed_players,
    'submitted_players', v_result.submitted_players,
    'team_completion_time_ms', v_result.team_completion_time_ms,
    'is_final', v_result.is_final,
    'calculated_at', v_result.calculated_at
  );
end;
$$;

-- ---- leaderboards ------------------------------------------------------------------------------
-- Public, but only public columns: names, campus, scores and times. No ids, no team codes.

create or replace function public.get_individual_leaderboard(p_limit integer default 25)
returns table (
  rank integer,
  display_name text,
  campus text,
  score integer,
  completion_time_ms integer,
  completed boolean,
  items_collected integer,
  attempts integer,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (r.user_id) r.user_id, r.score, r.completion_time_ms, r.completed, r.items_collected, r.created_at
    from public.player_game_results r
    where r.is_valid
    order by r.user_id, r.score desc, r.completion_time_ms asc, r.created_at asc
  ),
  attempts as (
    select user_id, count(*)::integer as attempts from public.player_game_results where is_valid group by user_id
  )
  select (row_number() over (order by b.score desc, b.completion_time_ms asc, b.created_at asc))::integer,
         p.display_name, p.campus, b.score, b.completion_time_ms, b.completed, b.items_collected::integer,
         a.attempts, coalesce(b.user_id = private.uid(), false)
  from best b
  join public.profiles p on p.id = b.user_id
  join attempts a on a.user_id = b.user_id
  order by 1
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
$$;

create or replace function public.get_team_leaderboard(p_limit integer default 25)
returns table (
  rank integer,
  team_id uuid,
  team_name text,
  team_score integer,
  completed_players integer,
  players integer,
  team_completion_time_ms integer,
  created_at timestamptz,
  is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with best as (
    select distinct on (tr.team_id) tr.team_id, tr.team_score, tr.completed_players, tr.submitted_players,
           tr.team_completion_time_ms, tr.calculated_at
    from public.team_results tr
    where tr.submitted_players > 0
    order by tr.team_id, tr.team_score desc, tr.team_completion_time_ms asc nulls last, tr.calculated_at asc
  )
  select (row_number() over (order by b.team_score desc, b.team_completion_time_ms asc nulls last, b.calculated_at asc))::integer,
         t.id, t.team_name, b.team_score, b.completed_players::integer, b.submitted_players::integer,
         b.team_completion_time_ms, t.created_at, private.is_team_member(t.id)
  from best b
  join public.teams t on t.id = b.team_id
  order by 1
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
$$;

-- ---- who may call what -------------------------------------------------------------------------

revoke all on all functions in schema private from public;
grant execute on function private.uid() to authenticated;
grant execute on function private.is_team_member(uuid) to authenticated;
grant execute on function private.is_active_team_member(uuid) to authenticated;
grant execute on function private.shares_team(text) to authenticated;

revoke execute on function
  public.ensure_profile(text, text),
  public.create_team(text),
  public.get_team_by_code(text),
  public.join_team(text),
  public.get_my_team(),
  public.leave_team(),
  public.set_ready(boolean),
  public.start_game(),
  public.touch_session(uuid, boolean),
  public.leave_session(uuid),
  public.submit_player_result(uuid, jsonb, integer),
  public.finalize_team_result(uuid),
  public.get_individual_leaderboard(integer),
  public.get_team_leaderboard(integer)
from public, anon;

grant execute on function
  public.ensure_profile(text, text),
  public.create_team(text),
  public.get_team_by_code(text),
  public.join_team(text),
  public.get_my_team(),
  public.leave_team(),
  public.set_ready(boolean),
  public.start_game(),
  public.touch_session(uuid, boolean),
  public.leave_session(uuid),
  public.submit_player_result(uuid, jsonb, integer),
  public.finalize_team_result(uuid),
  public.get_individual_leaderboard(integer),
  public.get_team_leaderboard(integer)
to authenticated;

grant execute on function public.get_individual_leaderboard(integer), public.get_team_leaderboard(integer) to anon;
