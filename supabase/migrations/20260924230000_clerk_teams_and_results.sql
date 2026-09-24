-- Moonlight Seva: Complete Supabase + Clerk Teams, Sessions, Results & Leaderboards Schema
-- Uses Clerk user.id as canonical player identity across all tables.

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. PROFILES TABLE
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  username text unique,
  display_name text,
  avatar_url text,
  campus text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure clerk_user_id column exists if table existed previously with text primary key
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'clerk_user_id'
  ) then
    alter table public.profiles add column clerk_user_id text;
    update public.profiles set clerk_user_id = id where clerk_user_id is null;
    alter table public.profiles alter column clerk_user_id set not null;
    create unique index if not exists profiles_clerk_user_id_idx on public.profiles(clerk_user_id);
  end if;
end $$;

create index if not exists profiles_clerk_user_id_idx on public.profiles(clerk_user_id);

-- ============================================================================
-- 2. TEAMS TABLE
-- ============================================================================
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  team_code text unique not null,
  creator_clerk_user_id text not null,
  creator_profile_id uuid references public.profiles(id) on delete set null,
  max_members integer not null default 4 check (max_members between 1 and 4),
  status text not null default 'waiting' check (status in ('waiting', 'ready', 'active', 'completed', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure creator_clerk_user_id exists
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'teams' and column_name = 'creator_clerk_user_id'
  ) then
    alter table public.teams add column creator_clerk_user_id text;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'creator_id') then
      update public.teams set creator_clerk_user_id = creator_id where creator_clerk_user_id is null;
    end if;
  end if;
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'teams' and column_name = 'creator_profile_id'
  ) then
    alter table public.teams add column creator_profile_id uuid references public.profiles(id) on delete set null;
  end if;
end $$;

create index if not exists teams_team_code_idx on public.teams(team_code);
create index if not exists teams_creator_clerk_user_id_idx on public.teams(creator_clerk_user_id);

-- ============================================================================
-- 3. TEAM MEMBERS TABLE
-- ============================================================================
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  clerk_user_id text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text,
  role text not null default 'member' check (role in ('creator', 'member')),
  is_ready boolean not null default false,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, clerk_user_id)
);

-- Ensure clerk_user_id column exists
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'team_members' and column_name = 'clerk_user_id'
  ) then
    alter table public.team_members add column clerk_user_id text;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'team_members' and column_name = 'user_id') then
      update public.team_members set clerk_user_id = user_id where clerk_user_id is null;
    end if;
  end if;
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'team_members' and column_name = 'profile_id'
  ) then
    alter table public.team_members add column profile_id uuid references public.profiles(id) on delete set null;
  end if;
end $$;

create index if not exists team_members_team_id_idx on public.team_members(team_id);
create index if not exists team_members_clerk_user_id_idx on public.team_members(clerk_user_id);
create index if not exists team_members_active_idx on public.team_members(team_id) where is_active;

-- ============================================================================
-- 4. GAME SESSIONS TABLE
-- ============================================================================
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by_clerk_user_id text not null,
  status text not null default 'lobby' check (status in ('lobby', 'starting', 'active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

-- Ensure created_by_clerk_user_id exists
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'game_sessions' and column_name = 'created_by_clerk_user_id'
  ) then
    alter table public.game_sessions add column created_by_clerk_user_id text;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_sessions' and column_name = 'created_by') then
      update public.game_sessions set created_by_clerk_user_id = created_by where created_by_clerk_user_id is null;
    end if;
  end if;
end $$;

create index if not exists game_sessions_team_id_idx on public.game_sessions(team_id);

-- ============================================================================
-- 5. SESSION PLAYERS TABLE
-- ============================================================================
create table if not exists public.session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  clerk_user_id text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  username text,
  display_name text,
  is_ready boolean not null default false,
  is_connected boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (session_id, clerk_user_id)
);

create index if not exists session_players_session_id_idx on public.session_players(session_id);
create index if not exists session_players_clerk_user_id_idx on public.session_players(clerk_user_id);

-- ============================================================================
-- 6. PLAYER GAME RESULTS TABLE
-- ============================================================================
create table if not exists public.player_game_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  clerk_user_id text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  score integer not null default 0,
  completion_time integer,
  items_required integer default 0,
  items_collected integer default 0,
  items_lost integer default 0,
  moonlight_exposure numeric default 0,
  shelters_used integer default 0,
  completed boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists player_game_results_clerk_user_id_idx on public.player_game_results(clerk_user_id);
create index if not exists player_game_results_team_id_idx on public.player_game_results(team_id);
create index if not exists player_game_results_session_id_idx on public.player_game_results(session_id);

-- ============================================================================
-- 7. TEAM RESULTS TABLE
-- ============================================================================
create table if not exists public.team_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  team_score integer not null default 0,
  completed_players integer not null default 0,
  team_completion_time integer,
  created_at timestamptz not null default now()
);

create index if not exists team_results_team_id_idx on public.team_results(team_id);
create index if not exists team_results_session_id_idx on public.team_results(session_id);

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Generate unique 6-character code (alphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789)
create or replace function public.generate_unique_team_code()
returns text
language plpgsql
volatile
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  bytes bytea;
  i int;
  exists_code boolean;
begin
  loop
    code := '';
    bytes := gen_random_bytes(6);
    for i in 0..5 loop
      code := code || substr(chars, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    select exists(select 1 from public.teams where team_code = code) into exists_code;
    if not exists_code then
      return code;
    end if;
  end loop;
end;
$$;

-- Snapshot builder function
create or replace function public.build_team_snapshot(p_team_id uuid)
returns jsonb
language sql
stable
security definer
as $$
  with t as (
    select * from public.teams where id = p_team_id
  ),
  s as (
    select * from public.game_sessions
    where team_id = p_team_id
    order by (status in ('lobby', 'active')) desc, created_at desc
    limit 1
  ),
  tr as (
    select * from public.team_results
    where team_id = p_team_id
    order by created_at desc
    limit 1
  )
  select jsonb_build_object(
    'server_time', now(),
    'team', (
      select jsonb_build_object(
        'id', t.id,
        'team_name', t.team_name,
        'team_code', t.team_code,
        'creator_id', t.creator_clerk_user_id,
        'creator_name', (select coalesce(p.display_name, p.username, 'Devotee') from public.profiles p where p.clerk_user_id = t.creator_clerk_user_id limit 1),
        'host_id', t.creator_clerk_user_id,
        'status', case when t.status = 'active' then 'in_game' when t.status = 'closed' then 'closed' else 'waiting' end,
        'max_members', t.max_members,
        'is_active', t.status <> 'closed',
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ) from t
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.clerk_user_id,
        'display_name', coalesce(m.display_name, (select coalesce(p.display_name, p.username, 'Devotee') from public.profiles p where p.clerk_user_id = m.clerk_user_id limit 1)),
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
        'status', case when s.status = 'active' then 'in_progress' else s.status end,
        'moon_seed', 42,
        'created_by', s.created_by_clerk_user_id,
        'started_at', s.started_at,
        'ended_at', s.ended_at,
        'created_at', s.created_at
      ) from s
    ),
    'session_players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', sp.clerk_user_id,
        'display_name', coalesce(sp.display_name, sp.username, 'Devotee'),
        'completion_state', case when r.completed then 'completed' else 'playing' end,
        'is_connected', sp.is_connected,
        'joined_at', sp.joined_at,
        'last_seen_at', sp.last_seen_at,
        'score', coalesce(r.score, 0),
        'completion_time_ms', coalesce(r.completion_time, 0),
        'completed', coalesce(r.completed, false)
      ) order by sp.joined_at)
      from public.session_players sp
      left join s on s.id = sp.session_id
      left join public.player_game_results r on r.session_id = sp.session_id and r.clerk_user_id = sp.clerk_user_id
      where sp.team_id = p_team_id and sp.session_id = s.id
    ), '[]'::jsonb),
    'team_result', (
      select jsonb_build_object(
        'team_score', tr.team_score,
        'completed_players', tr.completed_players,
        'team_completion_time_ms', tr.team_completion_time,
        'completed_at', tr.created_at
      ) from tr
    )
  );
$$;

-- ============================================================================
-- 9. RPC FUNCTIONS (SECURITY DEFINER, GRANTED TO ANON & AUTHENTICATED)
-- ============================================================================

-- Sync Clerk Profile
create or replace function public.sync_clerk_profile(
  p_clerk_user_id text,
  p_username text default null,
  p_display_name text default null,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_profile public.profiles;
begin
  if p_clerk_user_id is null or trim(p_clerk_user_id) = '' then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;

  insert into public.profiles (clerk_user_id, username, display_name, avatar_url, updated_at)
  values (
    p_clerk_user_id,
    nullif(trim(p_username), ''),
    coalesce(nullif(trim(p_display_name), ''), 'Devotee'),
    p_avatar_url,
    now()
  )
  on conflict (clerk_user_id) do update set
    username = coalesce(nullif(trim(p_username), ''), public.profiles.username),
    display_name = coalesce(nullif(trim(p_display_name), ''), public.profiles.display_name),
    avatar_url = coalesce(p_avatar_url, public.profiles.avatar_url),
    updated_at = now()
  returning * into v_profile;

  return jsonb_build_object(
    'id', v_profile.id,
    'clerk_user_id', v_profile.clerk_user_id,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url
  );
end;
$$;

-- Create Team (Atomic transaction)
create or replace function public.create_team(
  p_team_name text,
  p_clerk_user_id text,
  p_display_name text default 'Devotee',
  p_username text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_team_name text;
  v_code text;
  v_profile public.profiles;
  v_team public.teams;
  v_session public.game_sessions;
begin
  if p_clerk_user_id is null or trim(p_clerk_user_id) = '' then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;

  v_team_name := trim(coalesce(p_team_name, ''));
  if length(v_team_name) < 1 then
    raise exception using errcode = 'P0001', message = 'INVALID_TEAM_NAME';
  end if;
  if length(v_team_name) > 24 then
    v_team_name := left(v_team_name, 24);
  end if;

  -- Ensure profile
  insert into public.profiles (clerk_user_id, username, display_name, updated_at)
  values (p_clerk_user_id, nullif(trim(p_username), ''), coalesce(nullif(trim(p_display_name), ''), 'Devotee'), now())
  on conflict (clerk_user_id) do update set
    display_name = coalesce(nullif(trim(p_display_name), ''), public.profiles.display_name),
    updated_at = now()
  returning * into v_profile;

  -- Check active team
  if exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.clerk_user_id = p_clerk_user_id and tm.is_active and t.status in ('waiting', 'active', 'ready')
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_IN_TEAM';
  end if;

  -- Generate unique code
  v_code := public.generate_unique_team_code();

  -- Insert team
  insert into public.teams (
    team_name, team_code, creator_clerk_user_id, creator_profile_id, max_members, status
  ) values (
    v_team_name, v_code, p_clerk_user_id, v_profile.id, 4, 'waiting'
  ) returning * into v_team;

  -- Insert creator into team_members
  insert into public.team_members (
    team_id, clerk_user_id, profile_id, display_name, role, is_ready, is_active
  ) values (
    v_team.id, p_clerk_user_id, v_profile.id, v_profile.display_name, 'creator', false, true
  );

  -- Create initial game session
  insert into public.game_sessions (
    team_id, created_by_clerk_user_id, status
  ) values (
    v_team.id, p_clerk_user_id, 'lobby'
  ) returning * into v_session;

  -- Insert session player
  insert into public.session_players (
    session_id, team_id, clerk_user_id, profile_id, username, display_name, is_ready, is_connected
  ) values (
    v_session.id, v_team.id, p_clerk_user_id, v_profile.id, v_profile.username, v_profile.display_name, false, true
  );

  return public.build_team_snapshot(v_team.id);
end;
$$;

-- Join Team (Atomic transaction with row lock)
create or replace function public.join_team(
  p_team_code text,
  p_clerk_user_id text,
  p_display_name text default 'Devotee',
  p_username text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_code text;
  v_team public.teams;
  v_profile public.profiles;
  v_session public.game_sessions;
  v_active_count int;
begin
  if p_clerk_user_id is null or trim(p_clerk_user_id) = '' then
    raise exception using errcode = 'P0001', message = 'NOT_AUTHENTICATED';
  end if;

  v_code := upper(trim(coalesce(p_team_code, '')));
  if length(v_code) <> 6 then
    raise exception using errcode = 'P0001', message = 'INVALID_TEAM_CODE';
  end if;

  -- Find team with row lock
  select * into v_team from public.teams where team_code = v_code for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;

  if v_team.status not in ('waiting', 'ready') then
    raise exception using errcode = 'P0001', message = 'GAME_ALREADY_STARTED';
  end if;

  -- Ensure profile
  insert into public.profiles (clerk_user_id, username, display_name, updated_at)
  values (p_clerk_user_id, nullif(trim(p_username), ''), coalesce(nullif(trim(p_display_name), ''), 'Devotee'), now())
  on conflict (clerk_user_id) do update set
    display_name = coalesce(nullif(trim(p_display_name), ''), public.profiles.display_name),
    updated_at = now()
  returning * into v_profile;

  -- Check if already active member in THIS team
  if exists (
    select 1 from public.team_members
    where team_id = v_team.id and clerk_user_id = p_clerk_user_id and is_active
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_MEMBER';
  end if;

  -- Check if member of ANOTHER active team
  if exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.clerk_user_id = p_clerk_user_id and tm.team_id <> v_team.id and tm.is_active and t.status in ('waiting', 'active', 'ready')
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_IN_TEAM';
  end if;

  -- Check capacity
  select count(*) into v_active_count from public.team_members where team_id = v_team.id and is_active;
  if v_active_count >= v_team.max_members then
    raise exception using errcode = 'P0001', message = 'TEAM_FULL';
  end if;

  -- Insert or reactivate membership
  insert into public.team_members (
    team_id, clerk_user_id, profile_id, display_name, role, is_ready, is_active, joined_at, left_at
  ) values (
    v_team.id, p_clerk_user_id, v_profile.id, v_profile.display_name, 'member', false, true, now(), null
  )
  on conflict (team_id, clerk_user_id) do update set
    display_name = v_profile.display_name,
    is_active = true,
    is_ready = false,
    left_at = null,
    joined_at = now();

  -- Add to active game session
  select * into v_session from public.game_sessions where team_id = v_team.id order by created_at desc limit 1;
  if found then
    insert into public.session_players (
      session_id, team_id, clerk_user_id, profile_id, username, display_name, is_ready, is_connected
    ) values (
      v_session.id, v_team.id, p_clerk_user_id, v_profile.id, v_profile.username, v_profile.display_name, false, true
    )
    on conflict (session_id, clerk_user_id) do update set
      is_connected = true,
      last_seen_at = now();
  end if;

  return public.build_team_snapshot(v_team.id);
end;
$$;

-- Get Team by Code (Preview)
create or replace function public.get_team_by_code(p_team_code text)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_code text;
  v_team public.teams;
  v_count int;
  v_creator_name text;
begin
  v_code := upper(trim(coalesce(p_team_code, '')));
  select * into v_team from public.teams where team_code = v_code;
  if not found then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;

  select count(*) into v_count from public.team_members where team_id = v_team.id and is_active;
  select coalesce(display_name, username, 'Devotee') into v_creator_name 
  from public.profiles where clerk_user_id = v_team.creator_clerk_user_id limit 1;

  return jsonb_build_object(
    'team_name', v_team.team_name,
    'team_code', v_team.team_code,
    'status', case when v_team.status = 'active' then 'in_game' when v_team.status = 'closed' then 'closed' else 'waiting' end,
    'member_count', v_count,
    'max_members', v_team.max_members,
    'creator_name', coalesce(v_creator_name, 'Devotee')
  );
end;
$$;

-- Get My Active Team (For Page Refresh restoration)
create or replace function public.get_my_active_team(p_clerk_user_id text)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_team_id uuid;
begin
  if p_clerk_user_id is null or trim(p_clerk_user_id) = '' then
    return null;
  end if;

  select tm.team_id into v_team_id
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.clerk_user_id = p_clerk_user_id and tm.is_active and t.status <> 'closed'
  order by tm.joined_at desc
  limit 1;

  if v_team_id is null then
    return null;
  end if;

  return public.build_team_snapshot(v_team_id);
end;
$$;

-- Ready Status Toggle
create or replace function public.set_member_ready(
  p_team_id uuid,
  p_clerk_user_id text,
  p_ready boolean
)
returns jsonb
language plpgsql
security definer
as $$
begin
  update public.team_members
  set is_ready = p_ready
  where team_id = p_team_id and clerk_user_id = p_clerk_user_id and is_active;

  update public.session_players
  set is_ready = p_ready, last_seen_at = now()
  where team_id = p_team_id and clerk_user_id = p_clerk_user_id;

  return public.build_team_snapshot(p_team_id);
end;
$$;

-- Start Game (Creator only)
create or replace function public.start_team_game(
  p_team_id uuid,
  p_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_team public.teams;
begin
  select * into v_team from public.teams where id = p_team_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'TEAM_NOT_FOUND';
  end if;

  if v_team.creator_clerk_user_id <> p_clerk_user_id then
    raise exception using errcode = 'P0001', message = 'NOT_TEAM_CREATOR';
  end if;

  update public.teams set status = 'active', updated_at = now() where id = p_team_id;
  update public.game_sessions set status = 'active', started_at = coalesce(started_at, now()) where team_id = p_team_id and status = 'lobby';

  return public.build_team_snapshot(p_team_id);
end;
$$;

-- Leave Team
create or replace function public.leave_team(
  p_team_id uuid,
  p_clerk_user_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_team public.teams;
  v_active_count int;
begin
  select * into v_team from public.teams where id = p_team_id;
  if not found then
    return null;
  end if;

  update public.team_members
  set is_active = false, left_at = now()
  where team_id = p_team_id and clerk_user_id = p_clerk_user_id;

  update public.session_players
  set is_connected = false, last_seen_at = now()
  where team_id = p_team_id and clerk_user_id = p_clerk_user_id;

  select count(*) into v_active_count from public.team_members where team_id = p_team_id and is_active;
  if v_active_count = 0 then
    update public.teams set status = 'closed', updated_at = now() where id = p_team_id;
  end if;

  return public.build_team_snapshot(p_team_id);
end;
$$;

-- Submit Player Game Result
create or replace function public.submit_player_game_result(
  p_session_id uuid,
  p_team_id uuid,
  p_clerk_user_id text,
  p_score integer,
  p_completion_time integer,
  p_items_required integer default 0,
  p_items_collected integer default 0,
  p_items_lost integer default 0,
  p_moonlight_exposure numeric default 0,
  p_shelters_used integer default 0,
  p_completed boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.profiles where clerk_user_id = p_clerk_user_id limit 1;

  insert into public.player_game_results (
    session_id, team_id, clerk_user_id, profile_id, score, completion_time,
    items_required, items_collected, items_lost, moonlight_exposure, shelters_used, completed
  ) values (
    p_session_id, p_team_id, p_clerk_user_id, v_profile_id, p_score, p_completion_time,
    p_items_required, p_items_collected, p_items_lost, p_moonlight_exposure, p_shelters_used, p_completed
  );

  return jsonb_build_object('success', true);
end;
$$;

-- Finalize Team Result
create or replace function public.finalize_team_result(
  p_team_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_total_score int := 0;
  v_completed_count int := 0;
  v_max_time int := 0;
  v_result public.team_results;
begin
  select 
    coalesce(sum(score), 0),
    count(*),
    coalesce(max(completion_time), 0)
  into v_total_score, v_completed_count, v_max_time
  from public.player_game_results
  where session_id = p_session_id and completed = true;

  insert into public.team_results (
    team_id, session_id, team_score, completed_players, team_completion_time
  ) values (
    p_team_id, p_session_id, v_total_score, v_completed_count, v_max_time
  ) returning * into v_result;

  update public.teams set status = 'completed', updated_at = now() where id = p_team_id;
  update public.game_sessions set status = 'completed', ended_at = now() where id = p_session_id;

  return public.build_team_snapshot(p_team_id);
end;
$$;

-- Individual Leaderboard (Best score per player)
create or replace function public.get_individual_leaderboard(p_limit int default 25)
returns table (
  clerk_user_id text,
  username text,
  display_name text,
  avatar_url text,
  best_score int,
  games_played bigint
)
language sql
stable
security definer
as $$
  select 
    r.clerk_user_id,
    coalesce(p.username, 'devotee') as username,
    coalesce(p.display_name, p.username, 'Devotee') as display_name,
    p.avatar_url,
    max(r.score) as best_score,
    count(r.id) as games_played
  from public.player_game_results r
  left join public.profiles p on p.clerk_user_id = r.clerk_user_id
  where r.completed = true
  group by r.clerk_user_id, p.username, p.display_name, p.avatar_url
  order by best_score desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

-- Team Leaderboard (Best score per team)
create or replace function public.get_team_leaderboard(p_limit int default 25)
returns table (
  team_id uuid,
  team_name text,
  team_score int,
  completed_players int,
  team_completion_time int,
  created_at timestamptz
)
language sql
stable
security definer
as $$
  select 
    tr.team_id,
    t.team_name,
    tr.team_score,
    tr.completed_players,
    tr.team_completion_time,
    tr.created_at
  from public.team_results tr
  join public.teams t on t.id = tr.team_id
  order by tr.team_score desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.player_game_results enable row level security;
alter table public.team_results enable row level security;

-- Drop any previous conflicting policies
drop policy if exists "allow_all_read_profiles" on public.profiles;
drop policy if exists "allow_all_read_teams" on public.teams;
drop policy if exists "allow_all_read_members" on public.team_members;
drop policy if exists "allow_all_read_sessions" on public.game_sessions;
drop policy if exists "allow_all_read_session_players" on public.session_players;
drop policy if exists "allow_all_read_player_results" on public.player_game_results;
drop policy if exists "allow_all_read_team_results" on public.team_results;

-- Read policies for players (anon & authenticated)
create policy "allow_all_read_profiles" on public.profiles for select to anon, authenticated using (true);
create policy "allow_all_read_teams" on public.teams for select to anon, authenticated using (true);
create policy "allow_all_read_members" on public.team_members for select to anon, authenticated using (true);
create policy "allow_all_read_sessions" on public.game_sessions for select to anon, authenticated using (true);
create policy "allow_all_read_session_players" on public.session_players for select to anon, authenticated using (true);
create policy "allow_all_read_player_results" on public.player_game_results for select to anon, authenticated using (true);
create policy "allow_all_read_team_results" on public.team_results for select to anon, authenticated using (true);

-- ============================================================================
-- 11. GRANT EXECUTE ON ALL RPCs TO ANON & AUTHENTICATED
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.teams, public.team_members, public.game_sessions,
  public.session_players, public.player_game_results, public.team_results to anon, authenticated;

grant execute on function
  public.sync_clerk_profile(text, text, text, text),
  public.create_team(text, text, text, text),
  public.join_team(text, text, text, text),
  public.get_team_by_code(text),
  public.get_my_active_team(text),
  public.set_member_ready(uuid, text, boolean),
  public.start_team_game(uuid, text),
  public.leave_team(uuid, text),
  public.submit_player_game_result(uuid, uuid, text, integer, integer, integer, integer, integer, numeric, integer, boolean),
  public.finalize_team_result(uuid, uuid),
  public.get_individual_leaderboard(integer),
  public.get_team_leaderboard(integer)
to anon, authenticated;

-- ============================================================================
-- 12. SUPABASE REALTIME REPLICATION
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.team_members;
alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.session_players;
alter publication supabase_realtime add table public.team_results;
