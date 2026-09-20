/**
 * A production build guesses that its own host runs a session server. On a static host that guess
 * is wrong, and the game has to notice on the first try rather than leave the boards waiting.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ClientMessage, PlayerProfile, ServerMessage } from '../shared/multiplayer';
import { NetConnection } from './NetConnection';
import type { ConnectionStatus, Transport } from './Transport';

class Fake implements Transport {
  sent: ClientMessage[] = [];
  onMessage: ((m: ServerMessage) => void) | null = null;
  onStatus: ((s: ConnectionStatus) => void) | null = null;
  closed = false;
  readonly kind: 'socket' | 'local';
  constructor(kind: 'socket' | 'local') {
    this.kind = kind;
  }
  open(onMessage: (m: ServerMessage) => void, onStatus: (s: ConnectionStatus) => void) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }
  send(m: ClientMessage) {
    this.sent.push(m);
  }
  close() {
    this.closed = true;
  }
}

const profile: PlayerProfile = { playerId: 'PLY_ABCDE', displayName: 'Harsha', campus: '', createdAt: 0, bestIndividualScore: 0, gamesPlayed: 0 };

describe('NetConnection', () => {
  it('moves to the local referee when the server never answers, and repeats what was waiting', () => {
    const socket = new Fake('socket');
    const local = new Fake('local');
    const net = new NetConnection(socket, () => local);
    net.send({ type: 'hello', profile });
    net.send({ type: 'leaderboards' });
    socket.onStatus?.('connecting');
    socket.onStatus?.('offline');
    expect(socket.closed).toBe(true);
    expect(net.networked).toBe(false);
    expect(local.sent.map((m) => m.type)).toEqual(['hello', 'leaderboards']);
    // What the local referee says now reaches the services.
    const heard: string[] = [];
    net.on((m) => heard.push(m.type));
    local.onMessage?.({ type: 'leaderboards', boards: { individual: [], teams: [] } });
    expect(heard).toEqual(['leaderboards']);
    // …and the dead socket is no longer listened to.
    socket.onMessage?.({ type: 'pong', serverTime: 0 });
    expect(heard).toEqual(['leaderboards']);
  });

  it('gives up on a socket that never even connects', () => {
    vi.useFakeTimers();
    const socket = new Fake('socket');
    const local = new Fake('local');
    const net = new NetConnection(socket, () => local);
    net.send({ type: 'leaderboards' });
    socket.onStatus?.('connecting');
    vi.advanceTimersByTime(5000);
    expect(net.networked).toBe(false);
    expect(local.sent.map((m) => m.type)).toEqual(['leaderboards']);
    vi.useRealTimers();
  });

  it('keeps a real server that it reached, and says hello again when it comes back', () => {
    const socket = new Fake('socket');
    const local = new Fake('local');
    const net = new NetConnection(socket, () => local);
    net.send({ type: 'hello', profile });
    socket.onStatus?.('online');
    socket.onStatus?.('offline');
    expect(net.networked).toBe(true);
    expect(local.sent).toHaveLength(0);
    socket.sent = [];
    socket.onStatus?.('online');
    expect(socket.sent.map((m) => m.type)).toEqual(['hello']);
  });
});
