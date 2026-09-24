-- Realtime for team lobbies and shared villages.
--
-- Each team has one private channel, topic `team:<team uuid>`. The database announces changes on
-- it (a tiny `db_change` payload, never the rows themselves); clients then refetch the snapshot
-- through get_my_team(), because Postgres — not the message — is the source of truth. The same
-- channel carries Presence (who is online) and the players' transient movement broadcasts.

create or replace function private.can_use_team_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~ '^team:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_active_team_member(substr(p_topic, 6)::uuid);
end;
$$;

revoke all on function private.can_use_team_topic(text) from public;
grant execute on function private.can_use_team_topic(text) to authenticated;

drop policy if exists "Active team members receive their team channel" on realtime.messages;
create policy "Active team members receive their team channel"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.can_use_team_topic((select realtime.topic()))
  );

drop policy if exists "Active team members send on their team channel" on realtime.messages;
create policy "Active team members send on their team channel"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and private.can_use_team_topic((select realtime.topic()))
  );

create or replace function private.broadcast_team_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_team_id text := case when tg_table_name = 'teams' then v_row ->> 'id' else v_row ->> 'team_id' end;
begin
  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'op', tg_op),
    'db_change',
    'team:' || v_team_id,
    true
  );
  return null;
end;
$$;

revoke all on function private.broadcast_team_change() from public;

create trigger teams_broadcast
  after update on public.teams
  for each row execute function private.broadcast_team_change();

create trigger team_members_broadcast
  after insert or update on public.team_members
  for each row execute function private.broadcast_team_change();

create trigger game_sessions_broadcast
  after insert or update on public.game_sessions
  for each row execute function private.broadcast_team_change();

-- Heartbeats (last_seen_at) are not news; a player finishing or quitting is.
create trigger session_players_broadcast_insert
  after insert on public.session_players
  for each row execute function private.broadcast_team_change();

create trigger session_players_broadcast_update
  after update on public.session_players
  for each row
  when (old.completion_state is distinct from new.completion_state)
  execute function private.broadcast_team_change();

create trigger team_results_broadcast
  after insert or update on public.team_results
  for each row execute function private.broadcast_team_change();
