/**
 * Who is playing: the signed-in account's row in `profiles`.
 *
 * Clerk owns the account; the database owns the profile (name, campus, character, settings,
 * timestamps) and works out the career numbers from the stored runs. Nothing about the player is
 * kept in the browser beyond this copy of the row.
 */
import { cleanCampus, cleanName } from '../shared/identity';
import type { CharacterModel, PlayerGender, PlayerProfile } from '../shared/multiplayer';
import type { GameSettings } from '../shared/types';
import { Observable } from './Observable';
import { errorText, rpc } from './rpc';
import { toProfile, type RawProfile } from './snapshot';

export type ProfileState = 'signed-out' | 'loading' | 'ready';

/** A slider dragged across its range is one save, not fifty. */
const SETTINGS_DEBOUNCE_MS = 600;

export class PlayerProfileService {
  readonly profile = new Observable<PlayerProfile | null>(null);
  readonly state = new Observable<ProfileState>('signed-out');
  readonly saving = new Observable(false);
  readonly error = new Observable<string | null>(null);
  private userId: string | null = null;
  private pendingSettings: GameSettings | null = null;
  private settingsTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => void this.flushSettings());
  }

  /** The auth bridge calls this whenever the signed-in account changes. */
  async load(userId: string | null): Promise<void> {
    if (userId !== this.userId) this.dropPendingSettings();
    this.userId = userId;
    this.error.set(null);
    if (!userId) {
      this.profile.set(null);
      this.state.set('signed-out');
      return;
    }
    this.state.set('loading');
    try {
      const raw = await rpc<RawProfile | null>('get_my_profile');
      if (this.userId !== userId) return;
      this.profile.set(raw ? toProfile(raw) : null);
    } catch (error) {
      if (this.userId !== userId) return;
      this.error.set(errorText(error));
      this.profile.set(null);
    }
    this.state.set('ready');
  }

  /** Rereads the profile, e.g. after a run changed the best score. */
  async refresh(): Promise<void> {
    const userId = this.userId;
    if (!userId || !this.profile.get()) return;
    try {
      const raw = await rpc<RawProfile | null>('get_my_profile');
      if (raw && this.userId === userId) this.profile.set(toProfile(raw));
    } catch (error) {
      console.warn('[profiles] could not refresh the profile', error);
    }
  }

  /** The name the player typed on the way in. Creates the profile the first time. */
  async save(displayName: string, campus = ''): Promise<PlayerProfile | null> {
    const name = cleanName(displayName);
    if (!name || this.saving.get()) return null;
    this.saving.set(true);
    this.error.set(null);
    try {
      const profile = toProfile(await rpc<RawProfile>('ensure_profile', { p_display_name: name, p_campus: cleanCampus(campus) }));
      this.profile.set(profile);
      return profile;
    } catch (error) {
      this.error.set(errorText(error));
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  /** Name, campus, avatar and gender in one go, as the profile editor sends them. */
  async saveDetails(displayName: string, campus: string, character: CharacterModel, gender: PlayerGender | null): Promise<PlayerProfile | null> {
    if (!(await this.save(displayName, campus))) return null;
    this.saving.set(true);
    try {
      const profile = toProfile(await rpc<RawProfile>('update_profile_details', { p_character: character, p_gender: gender }));
      this.profile.set(profile);
      return profile;
    } catch (error) {
      this.error.set(errorText(error));
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  clearError(): void {
    this.error.set(null);
  }

  /** Saves the settings to the player's profile, shortly after the last change. */
  saveSettings(settings: GameSettings): void {
    if (!this.profile.get()) return;
    this.pendingSettings = settings;
    if (this.settingsTimer) clearTimeout(this.settingsTimer);
    this.settingsTimer = setTimeout(() => void this.flushSettings(), SETTINGS_DEBOUNCE_MS);
  }

  private async flushSettings(): Promise<void> {
    if (this.settingsTimer) clearTimeout(this.settingsTimer);
    this.settingsTimer = null;
    const settings = this.pendingSettings;
    const userId = this.userId;
    this.pendingSettings = null;
    if (!settings || !userId) return;
    try {
      const saved = await rpc<Partial<GameSettings>>('save_settings', { p_settings: settings });
      const current = this.profile.get();
      if (current && current.id === userId && this.userId === userId) this.profile.set({ ...current, settings: saved ?? {} });
    } catch (error) {
      // The game keeps playing with the new settings; they just won't follow the player elsewhere.
      console.warn('[profiles] could not save settings', error);
    }
  }

  private dropPendingSettings(): void {
    if (this.settingsTimer) clearTimeout(this.settingsTimer);
    this.settingsTimer = null;
    this.pendingSettings = null;
  }
}
