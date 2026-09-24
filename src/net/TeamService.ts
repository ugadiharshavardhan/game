/**
 * Teams: making one, joining one by code, leaving, readiness, starting a round — and the one
 * copy of "my team" the whole app reads.
 *
 * Every rule lives in Postgres. Each action is a single database function (create_team,
 * join_team, …) that locks what it needs and either succeeds completely or changes nothing, so
 * two players can never squeeze into the last place, and a code is only ever shown after the
 * team row it names has been committed.
 *
 * The snapshot held here is a cache of `get_my_team()`. It is replaced wholesale from the
 * database after every action and whenever the team's Realtime channel says something changed;
 * it is never patched from a message.
 */
import { normaliseTeamCode } from '../shared/identity';
import type { TeamMember, TeamPreview, TeamSnapshot } from '../shared/multiplayer';
import { Observable } from './Observable';
import { errorText, rpc } from './rpc';
import { toPreview, toSnapshot, type RawPreview, type RawSnapshot } from './snapshot';
import { TeamChannel } from './TeamChannel';

export type TeamBusy = 'loading' | 'creating' | 'joining' | 'leaving' | 'readying' | 'starting';

export interface LobbyStatus {
  canStart: boolean;
  /** Why not, in a sentence the player can act on. */
  reason: string | null;
  ready: number;
  total: number;
}

const NOTICE_MS = 4000;
/** Triggers fire once per row; a round starting touches several. One refetch covers them all. */
const REFRESH_DEBOUNCE_MS = 150;

export class TeamService {
  readonly snapshot = new Observable<TeamSnapshot | null>(null);
  /** False until the first `get_my_team()` for this account has come back. */
  readonly loaded = new Observable(false);
  readonly busy = new Observable<TeamBusy | null>(null);
  readonly error = new Observable<string | null>(null);
  /** "Rahul joined the team." — short-lived, for the lobby's toast. */
  readonly notice = new Observable<string | null>(null);
  readonly userId = new Observable<string | null>(null);
  readonly channel = new TeamChannel();

  private displayName = '';
  /** Bumped on every applied snapshot, so a slow refetch cannot overwrite a newer answer. */
  private version = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private again = false;
  /** Database clock minus ours, from the last snapshot. */
  private skew = 0;

  constructor() {
    this.channel.onChange(() => this.scheduleRefresh());
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.scheduleRefresh());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.scheduleRefresh();
      });
    }
  }

  /** The auth bridge calls this when the signed-in account (or its name) changes. */
  setUser(userId: string | null, displayName = ''): void {
    this.displayName = displayName;
    if (userId === this.userId.get()) {
      if (userId) this.channel.use(this.snapshot.get()?.team.id ?? null, userId, displayName);
      return;
    }
    this.userId.set(userId);
    this.version += 1;
    this.snapshot.set(null);
    this.loaded.set(false);
    this.error.set(null);
    this.channel.close();
    if (userId) void this.refresh();
  }

  // ---- reads ---------------------------------------------------------------------------------

  /** Refetches the authoritative team state. Concurrent calls share one request. */
  refresh(): Promise<void> {
    if (!this.userId.get()) return Promise.resolve();
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = (async () => {
      do {
        this.again = false;
        const version = this.version;
        const userId = this.userId.get();
        if (!this.loaded.get()) this.busy.set(this.busy.get() ?? 'loading');
        try {
          const raw = await rpc<RawSnapshot | null>('get_my_team');
          if (version === this.version && userId === this.userId.get()) this.apply(raw);
        } catch (error) {
          if (userId === this.userId.get()) this.error.set(errorText(error));
        } finally {
          if (this.busy.get() === 'loading') this.busy.set(null);
        }
      } while (this.again);
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** What a code points at, without joining it. */
  async preview(code: string): Promise<TeamPreview> {
    return toPreview(await rpc<RawPreview>('get_team_by_code', { p_team_code: normaliseTeamCode(code) }));
  }

  // ---- actions -------------------------------------------------------------------------------

  create(name: string): Promise<boolean> {
    return this.act('creating', async () => this.apply(await rpc<RawSnapshot>('create_team', { p_team_name: name })));
  }

  join(code: string): Promise<boolean> {
    return this.act('joining', async () => this.apply(await rpc<RawSnapshot>('join_team', { p_team_code: normaliseTeamCode(code) })));
  }

  leave(): Promise<boolean> {
    return this.act('leaving', async () => {
      await rpc<null>('leave_team');
      this.apply(null);
    });
  }

  setReady(ready: boolean): Promise<boolean> {
    return this.act('readying', async () => this.apply(await rpc<RawSnapshot>('set_ready', { p_ready: ready })));
  }

  /** Host only: opens the village for every member at once. */
  start(): Promise<boolean> {
    return this.act('starting', async () => this.apply(await rpc<RawSnapshot>('start_game')));
  }

  clearError(): void {
    this.error.set(null);
  }

  // ---- derived -------------------------------------------------------------------------------

  me(snapshot: TeamSnapshot | null = this.snapshot.get()): TeamMember | null {
    const id = this.userId.get();
    return snapshot?.members.find((m) => m.userId === id) ?? null;
  }

  isHost(snapshot: TeamSnapshot | null = this.snapshot.get()): boolean {
    return !!snapshot && snapshot.team.hostId === this.userId.get();
  }

  isCreator(snapshot: TeamSnapshot | null = this.snapshot.get()): boolean {
    return !!snapshot && snapshot.team.creatorId === this.userId.get();
  }

  /** Our clock, corrected to the database's, in epoch ms. */
  serverNow(): number {
    return Date.now() + this.skew;
  }

  lobbyStatus(snapshot: TeamSnapshot | null = this.snapshot.get()): LobbyStatus {
    const members = snapshot?.members ?? [];
    const ready = members.filter((m) => m.isReady).length;
    const status: LobbyStatus = { canStart: false, reason: null, ready, total: members.length };
    if (!snapshot) return { ...status, reason: 'No team yet.' };
    if (snapshot.session?.status === 'in_progress') return { ...status, reason: 'Your team is playing a round.' };
    if (ready < members.length) {
      const waiting = members.length - ready;
      return { ...status, reason: `Waiting for ${waiting} player${waiting === 1 ? '' : 's'} to be ready.` };
    }
    if (!this.isHost(snapshot)) return { ...status, reason: 'Waiting for the host to start.' };
    return { ...status, canStart: true };
  }

  // ---- internals -----------------------------------------------------------------------------

  private async act(kind: TeamBusy, run: () => Promise<void>): Promise<boolean> {
    const current = this.busy.get();
    if (current && current !== 'loading') return false;
    this.busy.set(kind);
    this.error.set(null);
    try {
      await run();
      return true;
    } catch (error) {
      this.error.set(errorText(error));
      // Whatever we thought, the database knows better: e.g. "already in a team" means we are.
      void this.refresh();
      return false;
    } finally {
      this.busy.set(null);
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  private apply(raw: RawSnapshot | null): void {
    this.version += 1;
    const next = raw ? toSnapshot(raw) : null;
    const previous = this.snapshot.get();
    if (next) this.skew = next.serverTime - Date.now();
    this.announceChanges(previous, next);
    this.snapshot.set(next);
    this.loaded.set(true);
    this.channel.use(next?.team.id ?? null, this.userId.get(), this.displayName);
  }

  private announceChanges(previous: TeamSnapshot | null, next: TeamSnapshot | null): void {
    if (!previous || !next || previous.team.id !== next.team.id) return;
    const me = this.userId.get();
    const before = new Map(previous.members.map((m) => [m.userId, m]));
    const after = new Map(next.members.map((m) => [m.userId, m]));
    const lines: string[] = [];
    for (const [id, m] of after) if (!before.has(id) && id !== me) lines.push(`${m.displayName} joined the team.`);
    for (const [id, m] of before) if (!after.has(id) && id !== me) lines.push(`${m.displayName} left the team.`);
    if (previous.team.hostId !== next.team.hostId && next.team.hostId === me) lines.push('You are now the team host.');
    if (lines.length) this.say(lines.join(' '));
  }

  private say(text: string): void {
    this.notice.set(text);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(null), NOTICE_MS);
  }
}
