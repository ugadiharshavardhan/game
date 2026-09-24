/**
 * Teams: making one, joining one by code, leaving, and who is in it.
 *
 * The client holds no rules — it asks, and believes what comes back. Capacity, codes and who may
 * start are the referee's business (`Authority`), which is what stops a modified client inviting
 * itself into somebody else's team.
 */
import { ERROR_TEXT, type ErrorCode, type PlayerProfile, type TeamState } from '../shared/multiplayer';
import type { NetConnection } from './NetConnection';
import { Observable } from './Observable';

export class TeamService {
  readonly team = new Observable<TeamState | null>(null);
  readonly error = new Observable<string | null>(null);
  readonly playerId = new Observable<string | null>(null);

  private readonly net: NetConnection;

  constructor(net: NetConnection) {
    this.net = net;
    this.net.on((message) => {
      switch (message.type) {
        case 'welcome':
          return this.playerId.set(message.playerId);
        case 'team':
          this.error.set(null);
          return this.team.set(message.team);
        case 'error':
          return this.error.set(ERROR_TEXT[message.code as ErrorCode] ?? ERROR_TEXT.unknown);
      }
    });
  }

  /** Says hello with this player's identity; safe to call again on every reconnect. */
  announce(profile: PlayerProfile): void {
    this.net.send({ type: 'hello', profile });
  }

  create(name: string, profile?: PlayerProfile | null): void {
    this.error.set(null);
    if (profile) this.announce(profile);
    this.net.send({ type: 'create-team', name });
  }

  join(code: string, profile?: PlayerProfile | null): void {
    this.error.set(null);
    if (profile) this.announce(profile);
    const trimmed = code.trim().toUpperCase();
    const tidy = normaliseTeamCode(trimmed);
    this.net.send({ type: 'join-team', code: tidy || trimmed });
  }

  leave(): void {
    this.net.send({ type: 'leave-team' });
    this.team.set(null);
  }

  clearError(): void {
    this.error.set(null);
  }

  /** Everyone but me. */
  teammates(): TeamState['members'] {
    const me = this.playerId.get();
    return (this.team.get()?.members ?? []).filter((m) => m.playerId !== me);
  }

  isHost(): boolean {
    const team = this.team.get();
    return !!team && team.hostId === this.playerId.get();
  }
}
