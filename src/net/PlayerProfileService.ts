/**
 * Who is playing — the whole of it.
 *
 * A name, optionally a campus, and an id this browser makes up the first time. No account, no
 * password, no email, no phone number, nothing that could identify a person off this device. Two
 * players called Harsha are different players because their ids differ, and for no other reason.
 */
import { cleanCampus, cleanName, makePlayerId } from '../shared/identity';
import type { PlayerProfile } from '../shared/multiplayer';
import { Observable } from './Observable';

const KEY = 'moonlight-seva.player';

function read(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PlayerProfile;
    return p?.playerId && p?.displayName ? p : null;
  } catch {
    return null;
  }
}

function write(profile: PlayerProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Private browsing: the player keeps their name for this session only.
  }
}

export class PlayerProfileService {
  readonly profile = new Observable<PlayerProfile | null>(read());

  /** The name the player typed on the way in. Keeps their id if they have played before. */
  signIn(displayName: string, campus = ''): PlayerProfile | null {
    const name = cleanName(displayName);
    if (!name) return null;
    const existing = this.profile.get();
    const profile: PlayerProfile = existing
      ? { ...existing, displayName: name, campus: cleanCampus(campus) }
      : { playerId: makePlayerId(), displayName: name, campus: cleanCampus(campus), createdAt: Date.now(), bestIndividualScore: 0, gamesPlayed: 0 };
    write(profile);
    this.profile.set(profile);
    return profile;
  }

  /** After a run: their own copy of what they have done. The boards are the server's business. */
  recordRun(score: number): void {
    const current = this.profile.get();
    if (!current) return;
    const profile: PlayerProfile = {
      ...current,
      gamesPlayed: current.gamesPlayed + 1,
      bestIndividualScore: Math.max(current.bestIndividualScore, score),
    };
    write(profile);
    this.profile.set(profile);
  }

  signOut(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing to forget.
    }
    this.profile.set(null);
  }
}
