-- The avatar a player walks the village as, and what they told us about themselves, are part of
-- the profile too. Career numbers (best score, games played) are never stored: they are read
-- from the counted runs, so they can't drift from the boards.

alter table public.profiles
  add column if not exists character text not null default 'devotee'
    check (character in ('devotee', 'woman', 'pujari')),
  add column if not exists gender text
    check (gender is null or gender in ('male', 'female', 'other'));

-- One shape for every function that hands a profile back to its owner.
create or replace function private.profile_json(p_uid text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'campus', p.campus,
    'character', p.character,
    'gender', p.gender,
    'settings', p.settings,
    'best_score', (select max(r.score) from public.player_game_results r where r.user_id = p.id and r.is_valid),
    'games_played', (select count(*) from public.player_game_results r where r.user_id = p.id and r.is_valid),
    'created_at', p.created_at,
    'last_active_at', p.last_active_at
  )
  from public.profiles p
  where p.id = p_uid
$$;

-- The signed-in player's own profile, or null before they have entered a name.
create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.profile_json(private.require_uid())
$$;

create or replace function public.update_profile_details(p_character text default null, p_gender text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles := private.require_profile();
begin
  if p_character is not null and p_character not in ('devotee', 'woman', 'pujari') then
    perform private.fail('BAD_NAME', 'unknown character');
  end if;
  if p_gender is not null and p_gender not in ('male', 'female', 'other') then
    perform private.fail('BAD_NAME', 'unknown gender');
  end if;
  update public.profiles
  set character = coalesce(p_character, character),
      gender = coalesce(p_gender, gender)
  where id = v_profile.id;
  return private.profile_json(v_profile.id);
end;
$$;

-- ensure_profile and save_settings answer with the full profile shape as well.
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
begin
  if v_name = '' then
    perform private.fail('BAD_NAME');
  end if;

  update public.profiles
  set display_name = v_name, campus = v_campus, last_active_at = now()
  where id = v_uid;

  if not found then
    v_base := btrim(left(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), 20), '_');
    if char_length(v_base) < 3 then
      v_base := 'player';
    end if;
    for i in 1..10 loop
      begin
        insert into public.profiles (id, username, display_name, campus)
        values (v_uid, v_base || '_' || lower(private.random_code(4)), v_name, v_campus)
        on conflict (id) do update set display_name = excluded.display_name, campus = excluded.campus, last_active_at = now();
        exit;
      exception when unique_violation then
        if i = 10 then
          perform private.fail('PROFILE_FAILED');
        end if;
      end;
    end loop;
  end if;

  update public.team_members set display_name = v_name where user_id = v_uid and is_active and display_name <> v_name;

  return private.profile_json(v_uid);
end;
$$;

revoke all on function private.profile_json(text) from public;
revoke execute on function public.get_my_profile(), public.update_profile_details(text, text) from public, anon;
grant execute on function public.get_my_profile(), public.update_profile_details(text, text) to authenticated;
