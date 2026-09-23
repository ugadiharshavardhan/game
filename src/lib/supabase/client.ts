/**
 * Browser Supabase client for Moonlight Seva.
 *
 * This is a Vite SPA (not Next.js), so we use the browser client from
 * `@supabase/supabase-js` — no cookie/middleware helpers.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function url(): string | undefined {
  return import.meta.env.VITE_SUPABASE_URL || undefined;
}

function key(): string | undefined {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || undefined;
}

export function createBrowserClient(): SupabaseClient {
  if (client) return client;
  const supabaseUrl = url();
  const supabaseKey = key();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local',
    );
  }
  client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

/** True when the Vite env has a Supabase project pointed at. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url() && key());
}
