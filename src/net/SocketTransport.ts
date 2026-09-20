/**
 * The real thing: a WebSocket to the session server, with the reconnection a phone on a village
 * Wi-Fi needs. Messages sent while the line is down wait in a short queue rather than being lost,
 * and the client says hello again on every reconnect, which is how a player walks back into the
 * session they dropped out of.
 */
import type { ClientMessage, ServerMessage } from '../shared/multiplayer';
import type { ConnectionStatus, Transport } from './Transport';

const RETRY_MS = [500, 1000, 2000, 4000, 8000];
const QUEUE_LIMIT = 32;

export class SocketTransport implements Transport {
  readonly kind = 'socket';
  private readonly url: string;
  private socket: WebSocket | null = null;
  private onMessage: ((m: ServerMessage) => void) | null = null;
  private onStatus: ((s: ConnectionStatus) => void) | null = null;
  private queue: ClientMessage[] = [];
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(url: string) {
    this.url = url;
  }

  open(onMessage: (m: ServerMessage) => void, onStatus: (s: ConnectionStatus) => void): void {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.dial();
  }

  private dial(): void {
    if (this.closed) return;
    this.onStatus?.('connecting');
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.onStatus?.('online');
      const waiting = this.queue;
      this.queue = [];
      for (const m of waiting) this.send(m);
    };
    socket.onmessage = (event) => {
      try {
        this.onMessage?.(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // A message we cannot read is a message we ignore.
      }
    };
    socket.onclose = () => {
      if (this.closed) return;
      this.onStatus?.('offline');
      const wait = RETRY_MS[Math.min(this.attempt++, RETRY_MS.length - 1)];
      this.timer = setTimeout(() => this.dial(), wait);
    };
    socket.onerror = () => socket.close();
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    // Position updates are worthless a second later; everything else waits.
    if (message.type === 'sync') return;
    if (this.queue.length < QUEUE_LIMIT) this.queue.push(message);
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }
}
