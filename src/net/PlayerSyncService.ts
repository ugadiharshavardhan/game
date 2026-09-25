/**
 * Where everyone is, several times a second — over the team's private Realtime channel, never
 * through Postgres (positions are transient; only results are worth keeping).
 *
 * Outgoing: the local player's position, heading and animation state, rounded to the centimetre
 * and the degree, sent only when something has actually changed — a player standing still costs
 * one message a second.
 *
 * Incoming: every teammate's last two positions, played back a little behind real time and
 * interpolated between them. That delay is what turns a stream of packets into a person
 * walking; without it a ghost on a phone's connection teleports.
 */
import type { PeerState, RemotePeer, TeamSnapshot } from '../shared/multiplayer';
import type { TeamChannel } from './TeamChannel';

export interface LocalPeerState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: string;
  indoors: boolean;
  given: number;
  collected?: number;
  completionPercent?: number;
}

interface Track {
  playerId: string;
  displayName: string;
  from: PeerState;
  to: PeerState;
  /** Local clock when `from` and `to` arrived, so playback does not depend on clocks agreeing. */
  fromAt: number;
  arrivedAt: number;
  presence: number;
}

/** Sends per second while moving. Four players at this rate stay far inside Realtime's quotas. */
const SEND_HZ = 6;
/** Played back this far behind, in milliseconds: about two updates. */
const DELAY_MS = 350;
/** Nobody heard from for this long has gone quiet: their ghost fades. */
const QUIET_MS = 3000;
/** And this long: they have gone. */
const GONE_MS = 15000;

export class PlayerSyncService {
  private readonly channel: TeamChannel;
  private readonly tracks = new Map<string, Track>();
  private names = new Map<string, string>();
  private last: LocalPeerState | null = null;
  private lastSentAt = 0;
  private readonly leaveListeners = new Set<(playerId: string) => void>();

  constructor(channel: TeamChannel) {
    this.channel = channel;
    channel.onPeer((peer) => this.receive(peer));
    channel.onPeerLeft((playerId) => this.drop(playerId));
  }

  /** Names come from the team snapshot, not from the position messages. */
  useTeam(snapshot: TeamSnapshot | null): void {
    this.names = new Map((snapshot?.members ?? []).map((m) => [m.userId, m.displayName]));
    for (const track of this.tracks.values()) track.displayName = this.names.get(track.playerId) ?? track.displayName;
  }

  /** Called by the engine every frame; sends at the configured rate, and only on a change. */
  send(state: LocalPeerState): void {
    const now = performance.now();
    if (now - this.lastSentAt < 1000 / SEND_HZ) return;
    const rounded: LocalPeerState = {
      x: Math.round(state.x * 100) / 100,
      y: Math.round(state.y * 100) / 100,
      z: Math.round(state.z * 100) / 100,
      yaw: Math.round(state.yaw * 100) / 100,
      state: state.state,
      indoors: state.indoors,
      given: state.given,
      collected: state.collected ?? 0,
      completionPercent: state.completionPercent ?? 0,
    };
    const still =
      this.last &&
      this.last.x === rounded.x &&
      this.last.z === rounded.z &&
      this.last.yaw === rounded.yaw &&
      this.last.state === rounded.state &&
      this.last.indoors === rounded.indoors &&
      this.last.given === rounded.given &&
      this.last.collected === rounded.collected &&
      this.last.completionPercent === rounded.completionPercent;
    // Standing still is still worth saying once a second, so a ghost never looks like a dropout.
    if (still && now - this.lastSentAt < 1000) return;
    this.lastSentAt = now;
    this.last = rounded;
    this.channel.sendPeer(rounded);
  }

  private receive(peer: PeerState): void {
    if (typeof peer.x !== 'number' || typeof peer.z !== 'number') return;
    const now = performance.now();
    const existing = this.tracks.get(peer.playerId);
    const displayName = this.names.get(peer.playerId) ?? existing?.displayName ?? 'Player';
    if (!existing) {
      this.tracks.set(peer.playerId, { playerId: peer.playerId, displayName, from: peer, to: peer, fromAt: now, arrivedAt: now, presence: 0 });
      return;
    }
    existing.from = existing.to;
    existing.fromAt = existing.arrivedAt;
    existing.to = peer;
    existing.arrivedAt = now;
    existing.displayName = displayName;
  }

  private drop(playerId: string): void {
    if (!this.tracks.delete(playerId)) return;
    for (const l of this.leaveListeners) l(playerId);
  }

  /** Everyone else, where they should be drawn right now. */
  peers(): RemotePeer[] {
    const now = performance.now();
    const out: RemotePeer[] = [];
    for (const track of [...this.tracks.values()]) {
      const age = now - track.arrivedAt;
      if (age > GONE_MS) {
        this.drop(track.playerId);
        continue;
      }
      // Fade in as they arrive, and away as they go quiet, rather than blinking either way.
      const target = age > QUIET_MS ? 0 : 1;
      track.presence += (target - track.presence) * 0.08;
      const span = Math.max(track.arrivedAt - track.fromAt, 1);
      const t = Math.min(Math.max((age - DELAY_MS + span) / span, 0), 1.25);
      out.push({
        playerId: track.playerId,
        displayName: track.displayName,
        x: lerp(track.from.x, track.to.x, t),
        y: lerp(track.from.y, track.to.y, t),
        z: lerp(track.from.z, track.to.z, t),
        yaw: lerpAngle(track.from.yaw, track.to.yaw, t),
        state: track.to.state,
        indoors: track.to.indoors,
        presence: track.presence,
        given: track.to.given ?? 0,
        collected: track.to.collected ?? 0,
        completionPercent: track.to.completionPercent ?? Math.min(100, Math.round(((track.to.given ?? 0) / 25) * 100)),
      });
    }
    return out;
  }

  onLeave(listener: (playerId: string) => void): () => void {
    this.leaveListeners.add(listener);
    return () => this.leaveListeners.delete(listener);
  }

  /** Leaving the village: tell the others, and forget them. */
  clear(): void {
    this.channel.sendPeerLeft();
    this.tracks.clear();
    this.last = null;
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}
