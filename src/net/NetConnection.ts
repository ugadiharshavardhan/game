/**
 * One line to the referee, shared by every multiplayer service.
 *
 * It chooses its transport: a real server when one is configured (`VITE_SESSION_SERVER`, or the
 * page's own host in production), and otherwise this device's own tabs, so the game is never
 * broken by the absence of a backend. Services subscribe to the message stream; nothing else in
 * the app knows whether there is a server at all.
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

export class NetConnection {
  readonly status = new Observable<ConnectionStatus>('offline');
  readonly config = new Observable<SessionConfig>(DEFAULT_SESSION_CONFIG);
  /** True when other devices can join; false when this is one browser's tabs. */
  readonly networked: boolean;

  private readonly transport: Transport;
  private readonly listeners = new Set<(message: ServerMessage) => void>();
  private opened = false;

  constructor(transport?: Transport) {
    const url = serverUrl();
    this.transport = transport ?? (url ? new SocketTransport(url) : new LocalTransport());
    this.networked = this.transport.kind === 'socket';
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.transport.open(
      (message) => {
        if (message.type === 'welcome') this.config.set(message.config);
        for (const l of this.listeners) l(message);
      },
      (status) => this.status.set(status),
    );
  }

  send(message: ClientMessage): void {
    this.open();
    this.transport.send(message);
  }

  on(listener: (message: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.transport.close();
    this.opened = false;
    this.status.set('offline');
  }
}
