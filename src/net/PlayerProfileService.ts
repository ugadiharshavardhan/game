/**
 * Who is playing: the signed-in account's row in `profiles`.
 *
 * Clerk owns the account; the database owns the profile (name, campus, username, timestamps).
 * When online, the row is synchronized with Supabase. When offline or if the team service is
 * not reachable, the profile is preserved locally so the player can always enter the village
 * and enjoy the game.
 */
import { createBrowserClient, isSupabaseConfigured } from '../lib/supabase/client';
import { cleanCampus, cleanName } from '../shared/identity';
import type { PlayerProfile } from '../shared/multiplayer';
import { Observable } from './Observable';
import { rpc } from './rpc';
import { toProfile, type RawProfile } from './snapshot';

export type ProfileState = 'signed-out' | 'loading' | 'ready';

const STORAGE_PREFIX = 'moonlight-seva.profile.';
const GLOBAL_KEY = 'moonlight-seva.player';

function makeLocalId(): string {
  return 'player_' + Math.random().toString(36).substring(2, 10);
}

function readLocal(userId?: string | null): PlayerProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    if (userId) {
      const raw = localStorage.getItem(STORAGE_PREFIX + userId);
      if (raw) return JSON.parse(raw) as PlayerProfile;
    }
    const globalRaw = localStorage.getItem(GLOBAL_KEY);
    if (globalRaw) return JSON.parse(globalRaw) as PlayerProfile;
    return null;
  } catch {
    return null;
  }
}

function writeLocal(profile: PlayerProfile): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (profile.id) {
      localStorage.setItem(STORAGE_PREFIX + profile.id, JSON.stringify(profile));
    }
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(profile));
  } catch {
    // Ignore private browsing storage quota issues
  }
}

export class PlayerProfileService {
  readonly profile = new Observable<PlayerProfile | null>(readLocal());
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

    // First check local storage for instant availability
    const cached = readLocal(userId);
    if (cached) {
      this.profile.set(cached);
    }

    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await createBrowserClient()
          .from('profiles')
          .select('id, username, display_name, campus, created_at, last_active_at')
          .eq('id', userId)
          .maybeSingle<RawProfile>();

        if (this.userId !== userId) return;

        if (error) {
          // If the backend has a JWT / third-party auth or network error, log it
          // but DO NOT show an aggressive red error on the initial welcome screen.
          console.warn('[profiles] Remote profile could not be loaded; using local profile if present:', error.message);
        } else if (data) {
          const remote = toProfile(data);
          if (cached) {
            remote.character = cached.character ?? remote.character;
            remote.gender = cached.gender ?? remote.gender;
          }
          writeLocal(remote);
          this.profile.set(remote);
        }
      } catch (err) {
        console.warn('[profiles] Could not connect to Supabase for profile load:', err);
      }
    }

    if (this.userId === userId) {
      this.state.set('ready');
    }
  }

  /** The name the player typed on the way in. Creates the profile the first time. */
  async save(displayName: string, campus = ''): Promise<PlayerProfile | null> {
    const name = cleanName(displayName);
    if (!name || this.saving.get()) return null;
    this.saving.set(true);
    this.error.set(null);

    const camp = cleanCampus(campus);
    const userId = this.userId;
    let saved: PlayerProfile | null = null;

    if (isSupabaseConfigured()) {
      try {
        const raw = await rpc<RawProfile>('ensure_profile', { p_display_name: name, p_campus: camp });
        if (raw) saved = toProfile(raw);
      } catch (err) {
        console.warn('[profiles] Backend profile save failed; saving locally so player can continue:', err);
      }
    }

    if (!saved) {
      const existing = userId ? readLocal(userId) : null;
      const baseName = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 16) || 'devotee';
      saved = {
        id: userId || existing?.id || makeLocalId(),
        username: existing?.username || `${baseName}_${Math.random().toString(36).substring(2, 6)}`,
        displayName: name,
        campus: camp,
        gender: existing?.gender ?? 'male',
        character: existing?.character ?? 'devotee',
        createdAt: existing?.createdAt || new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        bestIndividualScore: existing?.bestIndividualScore ?? 0,
        gamesPlayed: existing?.gamesPlayed ?? 0,
      };
    }

    writeLocal(saved);
    this.profile.set(saved);
    this.error.set(null);
    this.saving.set(false);
    return saved;
  }

  updateProfile(updates: Partial<PlayerProfile>): PlayerProfile | null {
    const current = this.profile.get();
    if (!current) return null;
    const next: PlayerProfile = {
      ...current,
      ...updates,
      displayName: updates.displayName ? cleanName(updates.displayName) : current.displayName,
      campus: updates.campus !== undefined ? cleanCampus(updates.campus) : current.campus,
    };
    writeLocal(next);
    this.profile.set(next);
    return next;
  }

  recordRun(score: number): void {
    const current = this.profile.get();
    if (!current) return;
    const profile: PlayerProfile = {
      ...current,
      gamesPlayed: (current.gamesPlayed ?? 0) + 1,
      bestIndividualScore: Math.max(current.bestIndividualScore ?? 0, score),
    };
    writeLocal(profile);
    this.profile.set(profile);
  }

  clearError(): void {
    this.error.set(null);
  }

  signOut(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        if (this.userId) localStorage.removeItem(STORAGE_PREFIX + this.userId);
        localStorage.removeItem(GLOBAL_KEY);
      }
    } catch {
      // Nothing
    }
    this.profile.set(null);
    this.state.set('signed-out');
  }
}
