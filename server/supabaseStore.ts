/**
 * AuthorityStore backed by Supabase `session_boards`.
 * Keeps an in-memory snapshot for sync `load()`, and writes asynchronously.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthorityStore, PersistedState } from '../src/net/Authority.ts';

const ROW_ID = 'default';

function supabaseUrl(): string | undefined {
  return process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function supabaseKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY
  );
}

export function isSupabaseStoreConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

export function createSupabaseServerClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!url || !key) {
    throw new Error('Supabase server client needs VITE_SUPABASE_URL and a key');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadBoardsFromSupabase(client: SupabaseClient): Promise<PersistedState | null> {
  const { data, error } = await client
    .from('session_boards')
    .select('players, teams')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) {
    console.warn('[session] supabase boards load failed:', error.message);
    return null;
  }
  if (!data) return null;
  return {
    players: (data.players ?? {}) as PersistedState['players'],
    teams: (data.teams ?? {}) as PersistedState['teams'],
  };
}

export function createSupabaseStore(
  client: SupabaseClient,
  initial: PersistedState | null,
): AuthorityStore {
  let snapshot: PersistedState | null = initial;
  let writing: Promise<void> | null = null;

  return {
    load(): PersistedState | null {
      return snapshot;
    },
    save(state: PersistedState) {
      snapshot = state;
      const write = async () => {
        const { error } = await client.from('session_boards').upsert(
          {
            id: ROW_ID,
            players: state.players,
            teams: state.teams,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );
        if (error) console.warn('[session] supabase boards save failed:', error.message);
      };
      writing = (writing ?? Promise.resolve()).then(write, write);
    },
  };
}
