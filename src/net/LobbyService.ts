/**
 * The lobby: who is ready, and whether the game may begin.
 *
 * Every rule here is a copy of the referee's, used only to grey out a button and explain why —
 * the referee decides for real, and refuses if the client asks out of turn.
 */
import type { SessionConfig, TeamState } from '../shared/multiplayer';
import type { NetConnection } from './NetConnection';
import type { TeamService } from './TeamService';

export interface LobbyStatus {
  canStart: boolean;
  /** Why not, in a sentence the player can act on. */
  reason: string | null;
  ready: number;
  online: number;
}

export class LobbyService {
  private readonly net: NetConnection;
  private readonly teams: TeamService;

  constructor(net: NetConnection, teams: TeamService) {
    this.net = net;
    this.teams = teams;
  }

  setReady(ready: boolean): void {
    this.net.send({ type: 'ready', ready });
  }

  start(): void {
    this.net.send({ type: 'start-session' });
  }

  get config(): SessionConfig {
    return this.net.config.get();
  }

  status(team: TeamState | null = this.teams.team.get()): LobbyStatus {
    const c = this.config;
    const members = team?.members.filter((m) => m.online) ?? [];
    const ready = members.filter((m) => m.ready).length;
    const status: LobbyStatus = { canStart: false, reason: null, ready, online: members.length };
    if (!team) return { ...status, reason: 'No team yet.' };
    if (members.length < c.minPlayers) return { ...status, reason: `Waiting for ${c.minPlayers - members.length} more.` };
    if (c.requireReady && ready < members.length) return { ...status, reason: `Waiting for ${members.length - ready} to be ready.` };
    if (!this.teams.isHost()) return { ...status, reason: 'Waiting for the host to start.' };
    return { ...status, canStart: true };
  }
}
