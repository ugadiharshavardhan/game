/**
 * Who is playing: the signed-in account's row in `profiles`.
 *
 * Clerk owns the account; the database owns the profile (name, campus, username, timestamps).
 * Nothing about the player is kept in the browser beyond this copy of the row.
 */
import { createBrowserClient } from '../lib/supabase/client';
import { cleanCampus, cleanName } from '../shared/identity';
import type { PlayerProfile } from '../shared/multiplayer';
import { Observable } from './Observable';
import { errorText, rpc, TeamServiceError } from './rpc';
import { toProfile, type RawProfile } from './snapshot';

export type ProfileState = 'signed-out' | 'loading' | 'ready';

export class PlayerProfileService {
  readonly profile = new Observable<PlayerProfile | null>(null);
  readonly state = new Observable<ProfileState>('signed-out');
  readonly saving = new Observable(false);
  readonly error = new Observable<string | null>(null);
  private userId: string | null = null;

  /** The auth bridge calls this whenever the signed-in account changes. */
  async load(userId: string | null): Promise<void> {
    this.userId = userId;
    this.error.set(null);
    if (!userId) {
      this.profile.set(null);
      this.state.set('signed-out');
      return;
    }
    this.state.set('loading');
    const { data, error } = await createBrowserClient()
      .from('profiles')
      .select('id, username, display_name, campus, created_at, last_active_at')
      .eq('id', userId)
      .maybeSingle<RawProfile>();
    if (this.userId !== userId) return;
    if (error) {
      console.error('[profiles] could not read the profile', error);
      this.error.set(errorText(new TeamServiceError('NETWORK', error.message)));
      this.profile.set(null);
    } else {
      this.profile.set(data ? toProfile(data) : null);
    }
    this.state.set('ready');
  }

  /** The name the player typed on the way in. Creates the profile the first time. */
  async save(displayName: string, campus = ''): Promise<PlayerProfile | null> {
    const name = cleanName(displayName);
    if (!name || this.saving.get()) return null;
    this.saving.set(true);
    this.error.set(null);
    try {
      const raw = await rpc<RawProfile>('ensure_profile', { p_display_name: name, p_campus: cleanCampus(campus) });
      const profile = toProfile(raw);
      this.profile.set(profile);
      return profile;
    } catch (error) {
      this.error.set(errorText(error));
      return null;
    } finally {
      this.saving.set(false);
    }
  }
}
