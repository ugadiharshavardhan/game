/**
 * Where everyone is, ten times a second.
 *
 * Outgoing: the local player's position, heading and animation state, rounded to the centimetre
 * and the degree, sent only when something has actually changed — a player standing still costs
 * nothing at all.
 *
 * Incoming: every teammate's last two positions, played back a fifth of a second behind real time
 * and interpolated between them. That delay is what turns a stream of packets into a person
 * walking; without it a ghost on a phone's connection teleports.
 */
import type { PeerState, RemotePeer, TeamState } from '../shared/multiplayer';
import type { NetConnection } from './NetConnection';

export interface LocalPeerState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: string;
  indoors: boolean;
  given: number;
}

interface Track {
  playerId: string;
  displayName: string;
  from: PeerState;
  to: PeerState;
  /** Local clock when `to` arrived, so playback does not depend on clocks agreeing. */
  arrivedAt: number;
  presence: number;
}

/** Played back this far behind, in milliseconds: two updates at 10 Hz. */
const DELAY_MS = 200;
/** Nobody heard from for this long has gone quiet: their ghost fades. */
const QUIET_MS = 3000;
/** And this long: they have gone. */
const GONE_MS = 15000;

export class PlayerSyncService {
  private readonly net: NetConnection;
  private readonly tracks = new Map<string, Track>();
  private names = new Map<string, string>();
  private last: LocalPeerState | null = null;
  private lastSentAt = 0;
  private readonly leaveListeners = new Set<(playerId: string) => void>();

  constructor(net: NetConnection) {
    this.net = net;
    this.net.on((message) => {
      if (message.type === 'peers') {
        for (const peer of message.peers) this.receive(peer);
      } else if (message.type === 'peer-left') {
        this.tracks.delete(message.playerId);
        for (const l of this.leaveListeners) l(message.playerId);
      }
    });
  }

  /** Names come from the team, not from the position messages: they are sent once, not per frame. */
  useTeam(team: TeamState | null): void {
    this.names = new Map((team?.members ?? []).map((m) => [m.playerId, m.displayName]));
    for (const track of this.tracks.values()) track.displayName = this.names.get(track.playerId) ?? track.displayName;
  }

  /** Called by the engine every frame; sends at the configured rate, and only on a change. */
  send(state: LocalPeerState): void {
    const now = performance.now();
    const interval = 1000 / Math.max(this.net.config.get().syncHz, 1);
    if (now - this.lastSentAt < interval) return;
    const rounded: LocalPeerState = {
      x: Math.round(state.x * 100) / 100,
      y: Math.round(state.y * 100) / 100,
      z: Math.round(state.z * 100) / 100,
      yaw: Math.round(state.yaw * 100) / 100,
      state: state.state,
      indoors: state.indoors,
      given: state.given,
    };
    const still =
      this.last &&
      this.last.x === rounded.x &&
      this.last.z === rounded.z &&
      this.last.yaw === rounded.yaw &&
      this.last.state === rounded.state &&
      this.last.indoors === rounded.indoors &&
      this.last.given === rounded.given;
    // Standing still is still worth saying once a second, so a ghost never looks like a dropout.
    if (still && now - this.lastSentAt < 1000) return;
    this.lastSentAt = now;
    this.last = rounded;
    this.net.send({ type: 'sync', state: rounded });
  }

  private receive(peer: PeerState): void {
    const existing = this.tracks.get(peer.playerId);
    const displayName = this.names.get(peer.playerId) ?? existing?.displayName ?? 'Player';
    if (!existing) {
      this.tracks.set(peer.playerId, { playerId: peer.playerId, displayName, from: peer, to: peer, arrivedAt: performance.now(), presence: 0 });
      return;
    }
    existing.from = existing.to;
    existing.to = peer;
    existing.arrivedAt = performance.now();
    existing.displayName = displayName;
  }

  /** Everyone else, where they should be drawn right now. */
  peers(): RemotePeer[] {
    const now = performance.now();
    const out: RemotePeer[] = [];
    for (const track of [...this.tracks.values()]) {
      const age = now - track.arrivedAt;
      if (age > GONE_MS) {
        this.tracks.delete(track.playerId);
        for (const l of this.leaveListeners) l(track.playerId);
        continue;
      }
      // Fade in as they arrive, and away as they go quiet, rather than blinking either way.
      const target = age > QUIET_MS ? 0 : 1;
      track.presence += (target - track.presence) * 0.08;
      const span = Math.max(track.to.t - track.from.t, 1);
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
      });
    }
    return out;
  }

  onLeave(listener: (playerId: string) => void): () => void {
    this.leaveListeners.add(listener);
    return () => this.leaveListeners.delete(listener);
  }

  clear(): void {
    this.tracks.clear();
    this.last = null;
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}
