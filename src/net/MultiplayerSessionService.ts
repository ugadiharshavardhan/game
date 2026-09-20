/**
 * The session everyone shares: one village, one moon.
 *
 * The referee hands out a session id, a moon seed and the moment the village opened. Every client
 * seeds its own moon with those, which is why the moon rises for all four players at once without
 * a single moon message ever being sent.
 */
import type { SessionInfo } from '../shared/multiplayer';
import type { NetConnection } from './NetConnection';
import { Observable } from './Observable';

export interface SessionClock {
  seed: number;
  /** Seconds the village has already been open when this player walks into it. */
  elapsed: number;
}

export class MultiplayerSessionService {
  readonly session = new Observable<SessionInfo | null>(null);
  /** The server's clock minus ours, so a late joiner's moon is in the right place. */
  private skew = 0;

  constructor(net: NetConnection) {
    net.on((message) => {
      switch (message.type) {
        case 'welcome':
          return void (this.skew = message.serverTime - Date.now());
        case 'session':
          return this.session.set(message.session);
        case 'team':
          if (message.team?.session) this.session.set(message.team.session);
          else if (!message.team) this.session.set(null);
          return;
      }
    });
  }

  /** What to start this player's moon with, or null when they are playing alone. */
  clock(): SessionClock | null {
    const session = this.session.get();
    if (!session) return null;
    const now = Date.now() + this.skew;
    return { seed: session.moonSeed, elapsed: Math.max(0, (now - session.startedAt) / 1000) };
  }

  clear(): void {
    this.session.set(null);
  }
}
