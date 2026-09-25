-- Settings and a player's own run history live in Postgres too, so nothing about a player is kept
-- in the browser: the settings follow the account to every device.

alter table public.profiles
  add column if not exists settings jsonb not null default '{}'::jsonb
  check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 1024);

-- Keeps only the settings the game knows, each clamped to what the settings screen allows.
create or replace function private.clean_settings(p_raw jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_raw) <> 'object' then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object(
    'sensitivity', case when jsonb_typeof(p_raw -> 'sensitivity') = 'number'
      then to_jsonb(least(greatest((p_raw ->> 'sensitivity')::numeric, 0.25), 3)) end,
    'invertY', case when jsonb_typeof(p_raw -> 'invertY') = 'boolean' then p_raw -> 'invertY' end,
    'volume', case when jsonb_typeof(p_raw -> 'volume') = 'number'
      then to_jsonb(least(greatest((p_raw ->> 'volume')::numeric, 0), 1)) end,
    'quality', case when p_raw ->> 'quality' in ('auto', 'low', 'medium', 'high') then p_raw -> 'quality' end,
    'showTouchControls', case when p_raw ->> 'showTouchControls' in ('auto', 'on', 'off') then p_raw -> 'showTouchControls' end
  )) end
$$;

create or replace function public.save_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := private.require_profile();
  v_clean jsonb := private.clean_settings(p_settings);
begin
  update public.profiles set settings = v_clean where id = v_profile.id;
  return v_clean;
end;
$$;

-- Same as before, and now also returns the saved settings.
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

  update public.team_members set display_name = v_name where user_id = v_uid and is_active and display_name <> v_name;

  return jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'campus', v_profile.campus,
    'settings', v_profile.settings,
    'created_at', v_profile.created_at,
    'last_active_at', v_profile.last_active_at
  );
end;
$$;

-- The caller's own runs, best first, each with its place among them. RLS already limits
-- player_game_results to the caller's own rows (and their teams'), so this runs as the caller.
create or replace function public.get_my_runs(p_limit integer default 10)
returns table (
  result_id uuid,
  run_rank integer,
  attempts integer,
  score integer,
  completion_time_ms integer,
  completed boolean,
  items_collected integer,
  team_id uuid,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select r.*,
           row_number() over (order by r.score desc, r.completion_time_ms asc, r.created_at asc) as rn,
           count(*) over () as n
    from public.player_game_results r
    where r.user_id = (select private.uid()) and r.is_valid
  )
  select id, rn::integer, n::integer, score, completion_time_ms, completed, items_collected::integer, team_id, created_at
  from mine
  order by rn
  limit least(greatest(coalesce(p_limit, 10), 1), 100)
$$;

revoke all on function private.clean_settings(jsonb) from public;
revoke execute on function public.save_settings(jsonb), public.get_my_runs(integer) from public, anon;
grant execute on function public.save_settings(jsonb), public.get_my_runs(integer) to authenticated;
