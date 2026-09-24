/**
 * The team's private Realtime channel, topic `team:<team id>`.
 *
 * Realtime authorisation (`realtime.messages` policies) only lets active members of that team
 * subscribe, so nobody else hears it. It carries three things:
 *  - `db_change` broadcasts sent by database triggers — a nudge, never data: listeners refetch
 *    the snapshot from Postgres, which is the source of truth;
 *  - Presence: who has the game open right now;
 *  - `peer` broadcasts: teammates' positions in the village, which are never written to Postgres.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '../lib/supabase/client';
import type { PeerState } from '../shared/multiplayer';
import { Observable } from './Observable';

export type ChannelStatus = 'idle' | 'connecting' | 'online' | 'offline';

const RETRY_MS = [1000, 2000, 5000, 10000, 15000];

export class TeamChannel {
  readonly status = new Observable<ChannelStatus>('idle');
  /** User ids with the game open, from Presence. */
  readonly online = new Observable<ReadonlySet<string>>(new Set());

  private channel: RealtimeChannel | null = null;
  private teamId: string | null = null;
  private userId: string | null = null;
  private displayName = '';
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly changeListeners = new Set<() => void>();
  private readonly peerListeners = new Set<(peer: PeerState) => void>();
  private readonly peerLeftListeners = new Set<(playerId: string) => void>();

  /** Joins `team:<teamId>` as this player, or leaves when teamId is null. Idempotent. */
  use(teamId: string | null, userId: string | null, displayName: string): void {
    this.displayName = displayName;
    if (teamId === this.teamId && userId === this.userId) return;
    this.close();
    this.teamId = teamId;
    this.userId = userId;
    if (teamId && userId) void this.open();
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  onPeer(listener: (peer: PeerState) => void): () => void {
    this.peerListeners.add(listener);
    return () => this.peerListeners.delete(listener);
  }

  onPeerLeft(listener: (playerId: string) => void): () => void {
    this.peerLeftListeners.add(listener);
    return () => this.peerLeftListeners.delete(listener);
  }

  sendPeer(state: Omit<PeerState, 'playerId'>): void {
    if (!this.channel || this.status.get() !== 'online' || !this.userId) return;
    void this.channel.send({ type: 'broadcast', event: 'peer', payload: { ...state, playerId: this.userId } });
  }

  sendPeerLeft(): void {
    if (!this.channel || this.status.get() !== 'online' || !this.userId) return;
    void this.channel.send({ type: 'broadcast', event: 'peer-left', payload: { playerId: this.userId } });
  }

  private async open(): Promise<void> {
    const teamId = this.teamId;
    const userId = this.userId;
    if (!teamId || !userId) return;
    this.status.set('connecting');
    const supabase = createBrowserClient();
    try {
      // Private channels are authorised with the current token; make sure the socket has it.
      await supabase.realtime.setAuth();
    } catch (error) {
      console.warn('[realtime] could not refresh the socket token', error);
    }
    if (this.teamId !== teamId || this.userId !== userId) return;

    const channel = supabase.channel(`team:${teamId}`, {
      config: { private: false, broadcast: { self: false }, presence: { key: userId } },
    });
    this.channel = channel;

    channel
      .on('broadcast', { event: 'db_change' }, () => this.emitChange())
      .on('broadcast', { event: 'peer' }, ({ payload }) => {
        const peer = payload as PeerState;
        if (peer?.playerId && peer.playerId !== this.userId) for (const l of this.peerListeners) l(peer);
      })
      .on('broadcast', { event: 'peer-left' }, ({ payload }) => {
        const id = (payload as { playerId?: string })?.playerId;
        if (id) for (const l of this.peerLeftListeners) l(id);
      })
      .on('presence', { event: 'sync' }, () => {
        this.online.set(new Set(Object.keys(channel.presenceState())));
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        for (const l of this.peerLeftListeners) l(key);
      })
      .subscribe((status, error) => {
        if (this.channel !== channel) return;
        if (status === 'SUBSCRIBED') {
          this.retries = 0;
          this.status.set('online');
          void channel.track({ name: this.displayName, at: Date.now() });
          // Anything that changed while we were away is in Postgres, not in missed messages.
          this.emitChange();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`[realtime] team channel ${status}`, error ?? '');
          this.status.set('offline');
          this.scheduleRetry();
        } else if (status === 'CLOSED') {
          this.status.set('offline');
        }
      });
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = RETRY_MS[Math.min(this.retries, RETRY_MS.length - 1)];
    this.retries += 1;
    const teamId = this.teamId;
    const userId = this.userId;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.teamId !== teamId || this.userId !== userId) return;
      this.dropChannel();
      void this.open();
    }, delay);
  }

  private emitChange(): void {
    for (const l of this.changeListeners) l();
  }

  private dropChannel(): void {
    const channel = this.channel;
    this.channel = null;
    if (channel) void createBrowserClient().removeChannel(channel);
  }

  close(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retries = 0;
    this.dropChannel();
    this.online.set(new Set());
    this.status.set('idle');
  }
}
