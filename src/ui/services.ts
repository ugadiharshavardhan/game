/**
 * The app's one set of multiplayer services, and the hook React reads them with.
 *
 * They are made once, lazily, the first time the menu asks for them — so a player who never
 * touches multiplayer never opens a connection, and the game still starts instantly.
 */
import { useSyncExternalStore } from 'react';
import { LeaderboardService } from '../net/LeaderboardService';
import { LobbyService } from '../net/LobbyService';
import { MultiplayerSessionService } from '../net/MultiplayerSessionService';
import { NetConnection } from '../net/NetConnection';
import type { Observable } from '../net/Observable';
import { PlayerProfileService } from '../net/PlayerProfileService';
import { PlayerSyncService } from '../net/PlayerSyncService';
import { ScoreService } from '../net/ScoreService';
import { TeamService } from '../net/TeamService';

export interface Services {
  net: NetConnection;
  profiles: PlayerProfileService;
  teams: TeamService;
  lobby: LobbyService;
  session: MultiplayerSessionService;
  sync: PlayerSyncService;
  scores: ScoreService;
  boards: LeaderboardService;
}

let made: Services | null = null;

export function services(): Services {
  if (made) return made;
  const net = new NetConnection();
  const teams = new TeamService(net);
  made = {
    net,
    profiles: new PlayerProfileService(),
    teams,
    lobby: new LobbyService(net, teams),
    session: new MultiplayerSessionService(net),
    sync: new PlayerSyncService(net),
    scores: new ScoreService(net),
    boards: new LeaderboardService(net),
  };
  // Names for the ghosts come from the team, not from the position updates.
  teams.team.subscribe((team) => made?.sync.useTeam(team));
  return made;
}

/** Reads an Observable in a component, the way React wants external state read. */
export function useObservable<T>(observable: Observable<T>): T {
  return useSyncExternalStore(observable.subscribe, () => observable.get());
}
