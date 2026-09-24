/**
 * Teams: making one, joining one by code, leaving, readiness, starting a round — and the one
 * copy of "my team" the whole app reads.
 *
 * Synchronized via Postgres functions when online, and backed by a distributed team coordinator
 * (teamStore with BroadcastChannel + localStorage + Realtime) so team creation and code-joining
 * work reliably under any network configuration.
 */
import { isSupabaseConfigured } from '../lib/supabase/client';
import { cleanName, normaliseTeamCode } from '../shared/identity';
import type { TeamMember, TeamPreview, TeamSnapshot } from '../shared/multiplayer';
import { verifyJwtSession } from './jwtAuth';
import { Observable } from './Observable';
import { errorText, rpc, TeamServiceError } from './rpc';
import { toPreview, toSnapshot, type RawPreview, type RawSnapshot } from './snapshot';
import { TeamChannel } from './TeamChannel';
import { teamStore } from './teamStore';

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
  /** False until the first team fetch for this account has come back. */
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

    // Listen to distributed team updates across browser sessions & tabs
    teamStore.onUpdate((snap) => {
      const me = this.userId.get();
      if (!me) return;
      if (snap.members.some((m) => m.userId === me)) {
        this.applyDirect(snap);
      } else {
        const cur = this.snapshot.get();
        if (cur && cur.team.id === snap.team.id) {
          this.applyDirect(null);
        }
      }
    });

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
    const userId = this.userId.get();
    if (!userId) return Promise.resolve();
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = (async () => {
      do {
        this.again = false;
        const version = this.version;
        if (!this.loaded.get()) this.busy.set(this.busy.get() ?? 'loading');
        try {
          if (isSupabaseConfigured()) {
            let raw: RawSnapshot | null = null;
            try {
              raw = await rpc<RawSnapshot | null>('get_my_active_team', { p_clerk_user_id: userId });
            } catch {
              raw = await rpc<RawSnapshot | null>('get_my_team');
            }
            if (version === this.version && userId === this.userId.get()) {
              if (raw) {
                this.apply(raw);
                if (this.snapshot.get()) teamStore.save(this.snapshot.get()!);
              }
            }
          }
        } catch (error) {
          console.warn('[teams] get_my_active_team lookup failed:', error);
        } finally {
          if (this.busy.get() === 'loading') this.busy.set(null);
        }

        // If no team from Supabase, check active team in local store
        if (!this.snapshot.get()) {
          const activeTeamId = typeof localStorage !== 'undefined' ? localStorage.getItem('moonlight-seva.active-team') : null;
          if (activeTeamId) {
            const stored = teamStore.getById(activeTeamId);
            if (stored && stored.members.some((m) => m.userId === userId)) {
              this.applyDirect(stored);
            }
          }
        }
      } while (this.again);
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** What a code points at, without joining it. */
  async preview(code: string): Promise<TeamPreview> {
    const tidy = normaliseTeamCode(code);
    if (isSupabaseConfigured()) {
      try {
        return toPreview(await rpc<RawPreview>('get_team_by_code', { p_team_code: tidy }));
      } catch {
        // Fallback to local store
      }
    }
    const local = (await teamStore.fetchByCode(tidy, 2000)) ?? teamStore.getByCode(tidy);
    if (local) {
      return {
        name: local.team.name,
        code: local.team.code,
        status: local.team.status,
        memberCount: local.members.length,
        maxMembers: local.team.maxMembers,
        creatorName: local.team.creatorName,
      };
    }
    throw new TeamServiceError('TEAM_NOT_FOUND');
  }

  // ---- actions -------------------------------------------------------------------------------

  async create(name: string): Promise<boolean> {
    const session = await verifyJwtSession();
    const userId = this.userId.get() || session?.userId;
    if (!userId) {
      this.error.set('Please log in with Google before creating a team.');
      return false;
    }
    const teamName = cleanName(name) || 'Moon Walkers';
    const effectiveName = this.displayName || session?.displayName || 'Devotee';
    if (!this.displayName) this.displayName = effectiveName;

    return this.act('creating', async () => {
      let raw: RawSnapshot | null = null;
      let lastError: unknown = null;

      if (isSupabaseConfigured()) {
        try {
          raw = await rpc<RawSnapshot>('create_team', {
            p_team_name: teamName,
            p_clerk_user_id: userId,
            p_display_name: effectiveName,
          });
        } catch (err) {
          lastError = err;
          try {
            raw = await rpc<RawSnapshot>('create_team', { p_team_name: teamName });
          } catch {
            // Re-throw the original error with detail
          }
        }
      }

      if (raw) {
        this.apply(raw);
        const cur = this.snapshot.get();
        if (cur) {
          teamStore.save(cur);
          this.channel.use(cur.team.id, userId, effectiveName);
        }
        return;
      }

      if (lastError) {
        throw lastError;
      }
      throw new TeamServiceError('NETWORK');
    });
  }

  async join(code: string): Promise<boolean> {
    const session = await verifyJwtSession();
    const userId = this.userId.get() || session?.userId;
    if (!userId) {
      this.error.set('Please log in with Google before joining a team.');
      return false;
    }
    const tidy = normaliseTeamCode(code);
    if (!tidy) {
      this.error.set('Please enter a 6-character team code.');
      return false;
    }
    const effectiveName = this.displayName || session?.displayName || 'Devotee';
    if (!this.displayName) this.displayName = effectiveName;

    return this.act('joining', async () => {
      let raw: RawSnapshot | null = null;
      let lastError: unknown = null;

      if (isSupabaseConfigured()) {
        try {
          raw = await rpc<RawSnapshot>('join_team', {
            p_team_code: tidy,
            p_clerk_user_id: userId,
            p_display_name: effectiveName,
          });
        } catch (err) {
          lastError = err;
          try {
            raw = await rpc<RawSnapshot>('join_team', { p_team_code: tidy });
          } catch {
            // Re-throw
          }
        }
      }

      if (raw) {
        this.apply(raw);
        const cur = this.snapshot.get();
        if (cur) {
          teamStore.save(cur);
          this.channel.use(cur.team.id, userId, effectiveName);
        }
        return;
      }

      if (lastError) {
        throw lastError;
      }
      throw new TeamServiceError('TEAM_NOT_FOUND');
    });
  }

  async leave(): Promise<boolean> {
    const userId = this.userId.get();
    const current = this.snapshot.get();
    return this.act('leaving', async () => {
      if (isSupabaseConfigured() && current && userId) {
        try {
          await rpc<RawSnapshot | null>('leave_team', {
            p_team_id: current.team.id,
            p_clerk_user_id: userId,
          });
        } catch {
          try {
            await rpc<null>('leave_team');
          } catch (err) {
            console.warn('[teams] Supabase leave_team error:', err);
          }
        }
      }
      if (current && userId) {
        const remainingMembers = current.members.filter((m) => m.userId !== userId);
        if (remainingMembers.length === 0) {
          teamStore.remove(current.team.id, current.team.code);
        } else {
          const newHostId = current.team.hostId === userId ? remainingMembers[0].userId : current.team.hostId;
          const updated: TeamSnapshot = {
            ...current,
            team: {
              ...current.team,
              hostId: newHostId,
              updatedAt: new Date().toISOString(),
            },
            members: remainingMembers,
            serverTime: Date.now(),
          };
          teamStore.save(updated);
        }
      }
      this.applyDirect(null);
    });
  }

  async setReady(ready: boolean): Promise<boolean> {
    const userId = this.userId.get();
    const current = this.snapshot.get();
    return this.act('readying', async () => {
      let raw: RawSnapshot | null = null;
      if (isSupabaseConfigured() && current && userId) {
        try {
          raw = await rpc<RawSnapshot>('set_member_ready', {
            p_team_id: current.team.id,
            p_clerk_user_id: userId,
            p_ready: ready,
          });
        } catch {
          try {
            raw = await rpc<RawSnapshot>('set_ready', { p_ready: ready });
          } catch (err) {
            console.warn('[teams] Supabase set_ready failed:', err);
          }
        }
      }
      if (raw) {
        this.apply(raw);
        const cur = this.snapshot.get();
        if (cur) teamStore.save(cur);
      } else if (current && userId) {
        const updatedSnapshot: TeamSnapshot = {
          ...current,
          members: current.members.map((m) => (m.userId === userId ? { ...m, isReady: ready } : m)),
          serverTime: Date.now(),
        };
        teamStore.save(updatedSnapshot);
        this.applyDirect(updatedSnapshot);
      }
    });
  }

  /** Host only: opens the village for every member at once. */
  async start(): Promise<boolean> {
    const current = this.snapshot.get();
    const userId = this.userId.get();
    return this.act('starting', async () => {
      let raw: RawSnapshot | null = null;
      if (isSupabaseConfigured() && current && userId) {
        try {
          raw = await rpc<RawSnapshot>('start_team_game', {
            p_team_id: current.team.id,
            p_clerk_user_id: userId,
          });
        } catch {
          try {
            raw = await rpc<RawSnapshot>('start_game');
          } catch (err) {
            console.warn('[teams] Supabase start_game failed:', err);
          }
        }
      }
      if (raw) {
        this.apply(raw);
        const cur = this.snapshot.get();
        if (cur) teamStore.save(cur);
        return;
      }
      if (current && userId) {
        const now = new Date().toISOString();
        const sessionId = 'session_' + Math.random().toString(36).substring(2, 10);
        const moonSeed = Math.floor(Math.random() * 1000000);
        const updatedSnapshot: TeamSnapshot = {
          ...current,
          serverTime: Date.now(),
          team: {
            ...current.team,
            status: 'in_game',
            updatedAt: now,
          },
          session: {
            id: sessionId,
            status: 'in_progress',
            moonSeed,
            createdBy: userId,
            startedAt: now,
            endedAt: null,
            createdAt: now,
          },
          sessionPlayers: current.members.map((m) => ({
            userId: m.userId,
            displayName: m.displayName,
            completionState: 'playing' as const,
            isConnected: true,
            joinedAt: now,
            lastSeenAt: now,
            score: null,
            completionTimeMs: null,
            completed: null,
          })),
        };
        teamStore.save(updatedSnapshot);
        this.applyDirect(updatedSnapshot);
      }
    });
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
    this.applyDirect(raw ? toSnapshot(raw) : null);
  }

  private applyDirect(next: TeamSnapshot | null): void {
    this.version += 1;
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
