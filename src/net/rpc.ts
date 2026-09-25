/**
 * The one door to the database. Every call is a Postgres function (see
 * `supabase/migrations/20260924082109_functions.sql`) that checks identity and the rules itself;
 * this only sends it, and turns a failure into a sentence a player can act on.
 *
 * The technical error always goes to the console, and never to the screen.
 */
import { createBrowserClient, isSupabaseConfigured } from '../lib/supabase/client';
import { ERROR_TEXT, type ErrorCode } from '../shared/multiplayer';

export class TeamServiceError extends Error {
  readonly code: ErrorCode;
  /** Why the database refused, in its own words (e.g. which rule a run broke). For logs. */
  readonly detail: string;

  constructor(code: ErrorCode, detail = '') {
    super(ERROR_TEXT[code]);
    this.name = 'TeamServiceError';
    this.code = code;
    this.detail = detail;
  }
}

interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

const KNOWN = new Set<string>(Object.keys(ERROR_TEXT));

function toServiceError(fn: string, error: PostgrestLikeError, status: number): TeamServiceError {
  const message = error.message ?? '';
  if (error.code === 'P0001' && KNOWN.has(message)) {
    const known = message as ErrorCode;
    if (import.meta.env.DEV) console.info(`[team-service] ${fn} → ${known}`, error.details ?? '');
    return new TeamServiceError(known, error.details ?? '');
  }
  console.error(`[team-service] ${fn} failed (HTTP ${status})`, error);
  // A token the project does not trust: almost always Clerk not added under Supabase
  // Authentication → Third-Party Auth, or the Clerk Supabase integration not activated.
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST302') {
    console.error('[team-service] Supabase rejected the Clerk session token. Check the Clerk third-party auth setup (README → Supabase).');
    return new TeamServiceError('AUTH_REJECTED', message);
  }
  return new TeamServiceError('NETWORK', message);
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isSupabaseConfigured()) {
    console.error('[team-service] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set.');
    throw new TeamServiceError('NETWORK', 'supabase not configured');
  }
  let response;
  try {
    response = await createBrowserClient().rpc(fn, args);
  } catch (error) {
    console.error(`[team-service] ${fn} could not be sent`, error);
    throw new TeamServiceError('NETWORK', String(error));
  }
  const { data, error, status } = response;
  if (error) throw toServiceError(fn, error, status);
  return data as T;
}

/** The sentence to show for anything a service call threw. */
export function errorText(error: unknown): string {
  return error instanceof TeamServiceError ? error.message : ERROR_TEXT.NETWORK;
}
