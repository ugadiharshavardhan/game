/**
 * How the game talks to whoever is refereeing: a socket to the server, or — with no server at
 * all — the tabs of one browser talking to each other. Everything above this line is the same
 * either way, so the backend can be swapped for a real one without the game noticing.
 */
import type { ClientMessage, ServerMessage } from '../shared/multiplayer';

export type ConnectionStatus = 'offline' | 'connecting' | 'online';

export interface Transport {
  /** 'socket' is a real server; 'local' is this device only. */
  readonly kind: 'socket' | 'local';
  open(onMessage: (message: ServerMessage) => void, onStatus: (status: ConnectionStatus) => void): void;
  send(message: ClientMessage): void;
  close(): void;
}
