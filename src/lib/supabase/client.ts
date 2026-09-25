/**
 * Browser Supabase client for Moonlight Seva.
 *
 * This is a Vite SPA (not Next.js), so we use the browser client from
 * `@supabase/supabase-js` — no cookie/middleware helpers.
 *
 * Identity comes from Clerk through Supabase third-party auth: every request and the Realtime
 * socket carry the Clerk session token, and Postgres reads the player id from its `sub` claim.
 * Only the publishable key is ever in the browser.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let tokenProvider: (() => Promise<string | null>) | null = null;

function url(): string | undefined {
  return import.meta.env.VITE_SUPABASE_URL || undefined;
}

function key(): string | undefined {
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_KEY ||
    undefined
  );
}

/** Set by the auth bridge once Clerk has loaded; null when signed out. */
export function setAccessTokenProvider(provider: (() => Promise<string | null>) | null): void {
  tokenProvider = provider;
  // The Realtime socket asks for the token itself; tell it the identity changed.
  if (client) void client.realtime.setAuth().catch((error: unknown) => console.warn('[supabase] realtime auth refresh failed', error));
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
    accessToken: async () => (tokenProvider ? await tokenProvider() : null),
  });
  return client;
}

/** True when the Vite env has a Supabase project pointed at. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url() && key());
}
