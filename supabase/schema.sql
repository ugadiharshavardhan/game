-- Moonlight Seva — boards persistence for the session Authority.
-- Run once in the Supabase SQL editor (Project → SQL → New query).

create table if not exists public.session_boards (
  id text primary key default 'default',
  players jsonb not null default '{}'::jsonb,
  teams jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.session_boards (id)
values ('default')
on conflict (id) do nothing;

alter table public.session_boards enable row level security;

-- Public can read boards (menus / GitHub Pages builds). Writes go through the
-- session server with the service role key, which bypasses RLS.
drop policy if exists "Anyone can read session boards" on public.session_boards;
create policy "Anyone can read session boards"
  on public.session_boards
  for select
  to anon, authenticated
  using (true);

-- If you have not set SUPABASE_SERVICE_ROLE_KEY on the server yet, temporarily
-- allow anon upserts so the publishable key can persist boards. Remove this
-- policy once the service role is configured.
drop policy if exists "Anon can upsert session boards (dev)" on public.session_boards;
create policy "Anon can upsert session boards (dev)"
  on public.session_boards
  for all
  to anon
  using (true)
  with check (true);
