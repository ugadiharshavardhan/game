/**
 * The engine's whole view of the network: where everyone else is, and somewhere to say where I am.
 *
 * `PlayerSyncService` satisfies this, but nothing in `src/game/` imports it — so the engine builds
 * and runs with no multiplayer at all, which is exactly what a solo run is.
 */
import type { RemotePeer } from '../../shared/multiplayer';

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

export interface PeerLink {
  /** Teammates, smoothed and ready to draw. */
  peers(): RemotePeer[];
  /** Where this player is now. Called every frame; the link decides how often to send. */
  send(state: LocalPeerState): void;
  onLeave(listener: (playerId: string) => void): () => void;
}
