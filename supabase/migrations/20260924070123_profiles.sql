-- Players. The id is the `sub` claim of the verified JWT: a Clerk user id (`user_…`) through
-- Supabase third-party auth, or a Supabase Auth uuid. It is text so either provider works.

-- Helpers used by RLS and the RPCs. `private` is not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.uid()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Crypto-random code from the unambiguous alphabet (no I, O, 0, 1). 32 symbols, so a byte mod 32
-- is unbiased.
create or replace function private.random_code(p_length integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b.bytes, i) % 32) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(p_length) as bytes) b,
       generate_series(0, p_length - 1) as i
$$;

create table if not exists public.profiles (
  id text primary key check (char_length(id) between 1 and 128),
  username text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null check (char_length(display_name) between 1 and 16),
  campus text not null default '' check (char_length(campus) <= 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  when (old.display_name is distinct from new.display_name or old.campus is distinct from new.campus)
  execute function private.set_updated_at();
