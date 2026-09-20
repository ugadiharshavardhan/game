/**
 * One line to the referee, shared by every multiplayer service.
 *
 * It chooses its transport: a real server when one is configured (`VITE_SESSION_SERVER`, or the
 * page's own host in production), and otherwise this device's own tabs, so the game is never
 * broken by the absence of a backend. Services subscribe to the message stream; nothing else in
 * the app knows whether there is a server at all.
 *
 * A production build guesses that its own host has a session server, and a static host (Vercel,
 * GitHub Pages) does not — the socket never opens, and the boards would sit on "Reading the
 * board…" for ever. So a socket that cannot be reached on the very first try is given up on: the
 * connection moves to this device's own referee and says hello again, with whatever was waiting.
 * A server that was reached and then lost is a different thing; that one is redialled, not left.
 */
import { DEFAULT_SESSION_CONFIG, type ClientMessage, type ServerMessage, type SessionConfig } from '../shared/multiplayer';
import { LocalTransport } from './LocalTransport';
import { Observable } from './Observable';
import { SocketTransport } from './SocketTransport';
import type { ConnectionStatus, Transport } from './Transport';

function serverUrl(): string | null {
  const configured = import.meta.env.VITE_SESSION_SERVER as string | undefined;
  if (configured) return configured;
  // A build served by the session server itself: the socket is on the same origin.
  if (typeof location !== 'undefined' && location.protocol.startsWith('http') && import.meta.env.PROD) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/session`;
  }
  return null;
}

/** How long a first connection may take before this device referees for itself. */
const FIRST_DIAL_MS = 4000;
/** Messages kept for the local referee if the first dial fails. */
const OUTBOX_LIMIT = 32;

export class NetConnection {
  readonly status = new Observable<ConnectionStatus>('offline');
  readonly config = new Observable<SessionConfig>(DEFAULT_SESSION_CONFIG);
  /** 'socket' when other devices can join; 'local' when this is one browser's tabs. */
  readonly mode: Observable<'socket' | 'local'>;

  private transport: Transport;
  private readonly listeners = new Set<(message: ServerMessage) => void>();
  private opened = false;
  private readonly fallbackTo: (() => Transport) | null;
  private readonly canFallBack: boolean;
  private everOnline = false;
  private dialTimer: ReturnType<typeof setTimeout> | null = null;
  private hello: ClientMessage | null = null;
  private outbox: ClientMessage[] = [];

  /** `fallback` is where to go if a socket cannot be reached; by default, this device's own tabs. */
  constructor(transport?: Transport, fallback?: () => Transport) {
    const url = transport ? null : serverUrl();
    this.transport = transport ?? (url ? new SocketTransport(url) : new LocalTransport());
    this.fallbackTo = fallback ?? (transport ? null : () => new LocalTransport());
    this.canFallBack = this.transport.kind === 'socket' && this.fallbackTo !== null;
    this.mode = new Observable(this.transport.kind);
  }

  /** True when other devices can join; false when this is one browser's tabs. */
  get networked(): boolean {
    return this.mode.get() === 'socket';
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.attach(this.transport);
    if (this.canFallBack) this.dialTimer = setTimeout(() => this.fallBack(), FIRST_DIAL_MS);
  }

  send(message: ClientMessage): void {
    this.open();
    if (message.type === 'hello') this.hello = message;
    else if (this.canFallBack && !this.everOnline && message.type !== 'sync' && this.outbox.length < OUTBOX_LIMIT) this.outbox.push(message);
    this.transport.send(message);
  }

  on(listener: (message: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.dialTimer) clearTimeout(this.dialTimer);
    this.dialTimer = null;
    this.transport.close();
    this.opened = false;
    this.status.set('offline');
  }

  private attach(transport: Transport): void {
    transport.open(
      (message) => {
        if (transport !== this.transport) return;
        if (message.type === 'welcome') this.config.set(message.config);
        for (const l of this.listeners) l(message);
      },
      (status) => this.onStatus(transport, status),
    );
  }

  private onStatus(transport: Transport, status: ConnectionStatus): void {
    if (transport !== this.transport) return;
    if (status === 'online') {
      const reconnect = this.everOnline && transport.kind === 'socket';
      this.everOnline = true;
      this.outbox = [];
      if (this.dialTimer) clearTimeout(this.dialTimer);
      this.dialTimer = null;
      // A server that lost us has forgotten who we are.
      if (reconnect && this.hello) transport.send(this.hello);
    } else if (status === 'offline' && this.canFallBack && !this.everOnline) {
      this.fallBack();
      return;
    }
    this.status.set(status);
  }

  /** The server never answered: referee on this device instead, and carry on where we were. */
  private fallBack(): void {
    if (!this.canFallBack || this.everOnline || this.transport.kind === 'local') return;
    if (this.dialTimer) clearTimeout(this.dialTimer);
    this.dialTimer = null;
    this.transport.close();
    // Taken before the new line opens: coming online clears the outbox.
    const waiting = this.outbox.splice(0);
    const local = (this.fallbackTo as () => Transport)();
    this.transport = local;
    this.mode.set('local');
    this.attach(local);
    if (this.hello) local.send(this.hello);
    for (const message of waiting) local.send(message);
  }
}
