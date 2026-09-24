/**
 * Multiplayer with no server: the tabs of one browser, refereed by whichever of them got there
 * first.
 *
 * One tab holds the `Authority` and answers everyone; the others post their messages to it over a
 * BroadcastChannel. The host renews a claim in localStorage every second, and if it goes away
 * (closed, crashed, or the laptop slept) another tab takes over. The boards are kept in
 * localStorage, so they survive all of it.
 *
 * This exists so the game is complete without a backend — a team can play on one laptop, and the
 * whole flow can be tested — but a session across two devices needs the real server.
 */
import type { ClientMessage, ServerMessage } from '../shared/multiplayer';
import { Authority, type PersistedState } from './Authority';
import type { ConnectionStatus, Transport } from './Transport';

const CHANNEL = 'moonlight-seva.session';
const HOST_KEY = 'moonlight-seva.host';
const BOARD_KEY = 'moonlight-seva.boards';
/** The host says it is still there this often; a claim older than three of these is up for grabs. */
const HEARTBEAT_MS = 1000;

type ToHost = { to: 'host'; from: string; message: ClientMessage };
type ToTab = { to: string; message: ServerMessage };
type Wire = ToHost | ToTab;

const isToHost = (w: Wire): w is ToHost => w.to === 'host';

const store = {
  load(): PersistedState | null {
    try {
      const raw = localStorage.getItem(BOARD_KEY);
      return raw ? (JSON.parse(raw) as PersistedState) : null;
    } catch {
      return null;
    }
  },
  save(state: PersistedState) {
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify(state));
    } catch {
      // Private browsing: the boards last as long as the tab does.
    }
  },
};

export class LocalTransport implements Transport {
  readonly kind = 'local';
  private readonly id = `tab-${Math.random().toString(36).slice(2, 10)}`;
  private channel: BroadcastChannel | null = null;
  private authority: Authority | null = null;
  private onMessage: ((m: ServerMessage) => void) | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private housekeeping: ReturnType<typeof setInterval> | null = null;
  private pending: ClientMessage[] = [];

  open(onMessage: (m: ServerMessage) => void, onStatus: (s: ConnectionStatus) => void): void {
    this.onMessage = onMessage;
    this.channel = new BroadcastChannel(CHANNEL);
    this.channel.onmessage = (event) => this.receive(event.data as Wire);
    this.claim();
    this.heartbeat = setInterval(() => this.claim(), HEARTBEAT_MS);
    onStatus('online');
  }

  /** Becomes the host if nobody else is, or is answering. */
  private claim(): void {
    const now = Date.now();
    let record: { id: string; at: number } | null = null;
    try {
      const raw = localStorage.getItem(HOST_KEY);
      record = raw ? (JSON.parse(raw) as { id: string; at: number }) : null;
    } catch {
      record = null;
    }
    const stale = !record || now - record.at > HEARTBEAT_MS * 3;
    if (record?.id === this.id || stale) {
      try {
        localStorage.setItem(HOST_KEY, JSON.stringify({ id: this.id, at: now }));
      } catch {
        // Without storage every tab referees itself: still playable, just not shared.
      }
      if (!this.authority) this.becomeHost();
    }
  }

  private becomeHost(): void {
    this.authority = new Authority({ store });
    this.housekeeping = setInterval(() => this.authority?.tick(), 30_000);
    // The host's own connection is direct; every other tab arrives over the channel.
    this.authority.connect(this.id, (m) => this.onMessage?.(m));
    const waiting = this.pending;
    this.pending = [];
    for (const m of waiting) this.authority.message(this.id, m);
  }

  private receive(wire: Wire): void {
    if (!wire) return;
    if (isToHost(wire)) {
      if (!this.authority) return;
      // A tab we have not heard from before is a new connection.
      if (!this.authority.has(wire.from)) {
        this.authority.connect(wire.from, (m) => this.channel?.postMessage({ to: wire.from, message: m } satisfies Wire));
      }
      this.authority.message(wire.from, wire.message);
      return;
    }
    if (wire.to === this.id) this.onMessage?.(wire.message);
  }

  send(message: ClientMessage): void {
    if (this.authority) {
      this.authority.message(this.id, message);
      return;
    }
    if (!this.channel) {
      this.pending.push(message);
      return;
    }
    this.channel.postMessage({ to: 'host', from: this.id, message } satisfies Wire);
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.housekeeping) clearInterval(this.housekeeping);
    this.authority?.disconnect(this.id);
    this.channel?.close();
    this.channel = null;
    this.authority = null;
  }
}
