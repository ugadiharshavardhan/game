/**
 * Distributed peer & global team coordinator for Moonlight Seva.
 *
 * Provides real-time team synchronization across browser sessions, tabs, and devices
 * via Supabase Realtime broadcast & presence + BroadcastChannel + localStorage,
 * guaranteeing seamless team creation and code-joining across different computers and browsers.
 */
import { createBrowserClient, isSupabaseConfigured } from '../lib/supabase/client';
import type { TeamSnapshot } from '../shared/multiplayer';

const CHANNEL_NAME = 'moonlight-seva.team-sync';
const STORAGE_PREFIX = 'moonlight-seva.team.';
const REALTIME_ROOM = 'moonlight-seva-teams-global';

export type TeamSyncMessage =
  | { type: 'team_update'; snapshot: TeamSnapshot }
  | { type: 'query_team'; code: string }
  | { type: 'team_leave'; teamId: string; userId: string };

class TeamStore {
  private localChannel: BroadcastChannel | null = null;
  private realtimeChannel: ReturnType<ReturnType<typeof createBrowserClient>['channel']> | null = null;
  private readonly listeners = new Set<(snapshot: TeamSnapshot) => void>();
  private readonly memoryCache = new Map<string, TeamSnapshot>();

  constructor() {
    // 1. Local tab synchronization
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.localChannel = new BroadcastChannel(CHANNEL_NAME);
        this.localChannel.onmessage = (event: MessageEvent<TeamSyncMessage>) => {
          if (event.data?.type === 'team_update' && event.data.snapshot) {
            this.cacheSnapshot(event.data.snapshot);
            this.notify(event.data.snapshot);
          } else if (event.data?.type === 'query_team' && event.data.code) {
            const hit = this.getByCode(event.data.code);
            if (hit) this.broadcast(hit);
          }
        };
      } catch (err) {
        console.warn('[teamStore] BroadcastChannel initialization failed:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key?.startsWith(STORAGE_PREFIX) && e.newValue) {
          try {
            const snap = JSON.parse(e.newValue) as TeamSnapshot;
            if (snap?.team?.id) {
              this.cacheSnapshot(snap);
              this.notify(snap);
            }
          } catch {
            // Ignore parse errors
          }
        }
      });
    }

    // 2. Global cross-network synchronization via Supabase Realtime
    if (typeof window !== 'undefined' && isSupabaseConfigured()) {
      try {
        const client = createBrowserClient();
        this.realtimeChannel = client.channel(REALTIME_ROOM, {
          config: { broadcast: { self: false } },
        });

        this.realtimeChannel
          .on('broadcast', { event: 'team_update' }, ({ payload }) => {
            const snap = payload?.snapshot as TeamSnapshot | undefined;
            if (snap?.team?.code) {
              this.cacheSnapshot(snap);
              this.notify(snap);
            }
          })
          .on('broadcast', { event: 'query_team' }, ({ payload }) => {
            const code = payload?.code as string | undefined;
            if (code) {
              const hit = this.getByCode(code);
              if (hit) {
                this.broadcast(hit);
              }
            }
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              // Re-announce any active local team
              const active = this.getActiveTeam();
              if (active) {
                void this.realtimeChannel?.track({ code: active.team.code.toUpperCase(), snapshot: active });
              }
            }
          });
      } catch (err) {
        console.warn('[teamStore] Supabase Realtime setup failed:', err);
      }
    }
  }

  private cacheSnapshot(snapshot: TeamSnapshot): void {
    if (!snapshot?.team?.id || !snapshot?.team?.code) return;
    this.memoryCache.set(snapshot.team.id, snapshot);
    this.memoryCache.set(snapshot.team.code.toUpperCase(), snapshot);
  }

  save(snapshot: TeamSnapshot): void {
    this.cacheSnapshot(snapshot);
    if (typeof localStorage !== 'undefined') {
      try {
        const serialized = JSON.stringify(snapshot);
        localStorage.setItem(STORAGE_PREFIX + snapshot.team.id, serialized);
        localStorage.setItem(STORAGE_PREFIX + snapshot.team.code.toUpperCase(), serialized);
        localStorage.setItem('moonlight-seva.active-team', snapshot.team.id);
      } catch (err) {
        console.warn('[teamStore] Could not save team snapshot:', err);
      }
    }
    this.broadcast(snapshot);
  }

  getActiveTeam(): TeamSnapshot | null {
    if (typeof localStorage === 'undefined') return null;
    const activeId = localStorage.getItem('moonlight-seva.active-team');
    return activeId ? this.getById(activeId) : null;
  }

  getById(teamId: string): TeamSnapshot | null {
    if (this.memoryCache.has(teamId)) return this.memoryCache.get(teamId)!;
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + teamId);
      if (raw) {
        const parsed = JSON.parse(raw) as TeamSnapshot;
        this.cacheSnapshot(parsed);
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  getByCode(code: string): TeamSnapshot | null {
    const clean = code.trim().toUpperCase();
    if (this.memoryCache.has(clean)) return this.memoryCache.get(clean)!;

    // Check Supabase Realtime Presence
    if (this.realtimeChannel) {
      try {
        const presence = this.realtimeChannel.presenceState();
        for (const key of Object.keys(presence)) {
          for (const item of presence[key] as Array<{ code?: string; snapshot?: TeamSnapshot }>) {
            if (item.code?.toUpperCase() === clean && item.snapshot) {
              this.cacheSnapshot(item.snapshot);
              return item.snapshot;
            }
          }
        }
      } catch {
        // Presence check ignored
      }
    }

    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + clean);
      if (raw) {
        const parsed = JSON.parse(raw) as TeamSnapshot;
        this.cacheSnapshot(parsed);
        return parsed;
      }

      // Scan all stored teams in local storage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORAGE_PREFIX)) {
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val) as TeamSnapshot;
            if (parsed?.team?.code?.toUpperCase() === clean) {
              this.cacheSnapshot(parsed);
              return parsed;
            }
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  /** Queries peers across tabs and across internet via Supabase Realtime. */
  async fetchByCode(code: string, timeoutMs = 2500): Promise<TeamSnapshot | null> {
    const immediate = this.getByCode(code);
    if (immediate) return immediate;

    const clean = code.trim().toUpperCase();

    // Broadcast query to all active peers
    if (this.realtimeChannel) {
      void this.realtimeChannel.send({
        type: 'broadcast',
        event: 'query_team',
        payload: { code: clean },
      });
    }
    if (this.localChannel) {
      try {
        this.localChannel.postMessage({ type: 'query_team', code: clean });
      } catch {
        // Ignored
      }
    }

    return new Promise((resolve) => {
      let resolved = false;
      const unlisten = this.onUpdate((snapshot) => {
        if (snapshot.team.code.toUpperCase() === clean) {
          if (!resolved) {
            resolved = true;
            unlisten();
            resolve(snapshot);
          }
        }
      });

      // Poll periodically up to timeout
      const start = Date.now();
      const interval = setInterval(() => {
        const hit = this.getByCode(clean);
        if (hit && !resolved) {
          resolved = true;
          clearInterval(interval);
          unlisten();
          resolve(hit);
        } else if (Date.now() - start >= timeoutMs && !resolved) {
          resolved = true;
          clearInterval(interval);
          unlisten();
          resolve(this.getByCode(clean));
        }
      }, 200);
    });
  }

  remove(teamId: string, code?: string): void {
    this.memoryCache.delete(teamId);
    if (code) this.memoryCache.delete(code.toUpperCase());
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_PREFIX + teamId);
      if (code) localStorage.removeItem(STORAGE_PREFIX + code.toUpperCase());
      localStorage.removeItem('moonlight-seva.active-team');
    } catch {
      // Ignore
    }
  }

  broadcast(snapshot: TeamSnapshot): void {
    this.cacheSnapshot(snapshot);

    // 1. Broadcast locally
    if (this.localChannel) {
      try {
        this.localChannel.postMessage({ type: 'team_update', snapshot } satisfies TeamSyncMessage);
      } catch {
        // Broadcast failed
      }
    }

    // 2. Broadcast globally across internet via Supabase Realtime
    if (this.realtimeChannel) {
      try {
        void this.realtimeChannel.send({
          type: 'broadcast',
          event: 'team_update',
          payload: { snapshot },
        });
        void this.realtimeChannel.track({
          code: snapshot.team.code.toUpperCase(),
          snapshot,
        });
      } catch {
        // Realtime broadcast failed
      }
    }

    this.notify(snapshot);
  }

  onUpdate(listener: (snapshot: TeamSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(snapshot: TeamSnapshot): void {
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const teamStore = new TeamStore();
