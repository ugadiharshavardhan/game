/**
 * The round everyone shares: one village, one moon.
 *
 * A round is a `game_sessions` row. When the host starts it, every member is written into its
 * roster, and each client sees it in its next team snapshot — so all four walk into the same
 * session, not four sessions. The moon is fully determined by the round's seed and the moment it
 * opened, which is why it rises for everyone at once without a single moon message being sent.
 *
 * A player who refreshes mid-round is still `playing` in the roster, so they walk straight back in.
 */
import type { GameSession, TeamSnapshot } from '../shared/multiplayer';
import { Observable } from './Observable';
import { rpc } from './rpc';
import type { TeamService } from './TeamService';

export interface SessionClock {
  seed: number;
  /** Seconds the village has already been open when this player walks into it. */
  elapsed: number;
}

/** How often a player in the village tells the database they are still there. */
const HEARTBEAT_MS = 30_000;

export class MultiplayerSessionService {
  /** The round this player is in and still playing, or null. */
  readonly session = new Observable<GameSession | null>(null);
  private readonly teams: TeamService;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** Rounds this player has finished or quit here: a snapshot read before that landed must not pull them back in. */
  private readonly done = new Set<string>();

  constructor(teams: TeamService) {
    this.teams = teams;
    teams.snapshot.subscribe((snapshot) => this.follow(snapshot));
  }

  /** What to start this player's moon with, or null when they are playing alone. */
  clock(): SessionClock | null {
    const session = this.session.get();
    if (!session?.startedAt) return null;
    return { seed: session.moonSeed, elapsed: Math.max(0, (this.teams.serverNow() - Date.parse(session.startedAt)) / 1000) };
  }

  /** This player's run in the round is over (its result is being submitted). */
  finish(sessionId: string): void {
    this.done.add(sessionId);
    if (this.session.get()?.id !== sessionId) return;
    this.session.set(null);
    this.stopHeartbeat();
  }

  /** Quitting the round without finishing it: frees the team to start the next one. */
  async leave(): Promise<void> {
    const session = this.session.get();
    if (!session) return;
    this.finish(session.id);
    try {
      await rpc<null>('leave_session', { p_session_id: session.id });
    } catch (error) {
      console.error('[session] could not leave the round', error);
    }
    void this.teams.refresh();
  }

  private follow(snapshot: TeamSnapshot | null): void {
    const me = this.teams.userId.get();
    const round = snapshot?.session;
    const playing =
      round?.status === 'in_progress' &&
      snapshot?.sessionPlayers.some((p) => p.userId === me && p.completionState === 'playing');
    const next = playing && round && !this.done.has(round.id) ? round : null;
    if (next?.id === this.session.get()?.id) return;
    this.session.set(next);
    if (next) this.startHeartbeat(next.id);
    else this.stopHeartbeat();
  }

  private startHeartbeat(sessionId: string): void {
    this.stopHeartbeat();
    const beat = () =>
      void rpc<null>('touch_session', { p_session_id: sessionId, p_connected: true }).catch((error: unknown) =>
        console.warn('[session] heartbeat failed', error),
      );
    beat();
    this.heartbeat = setInterval(beat, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}
