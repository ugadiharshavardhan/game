/**
 * The app's one set of multiplayer services, and the hook React reads them with.
 *
 * They are made once, lazily. Nothing talks to Supabase until the auth bridge has a signed-in
 * account, so a player who never signs in never opens a connection.
 */
import { useSyncExternalStore } from 'react';
import { LeaderboardService } from '../net/LeaderboardService';
import { MultiplayerSessionService } from '../net/MultiplayerSessionService';
import type { Observable } from '../net/Observable';
import { PlayerProfileService } from '../net/PlayerProfileService';
import { PlayerSyncService } from '../net/PlayerSyncService';
import { ScoreService } from '../net/ScoreService';
import { TeamService } from '../net/TeamService';

export interface Services {
  profiles: PlayerProfileService;
  teams: TeamService;
  session: MultiplayerSessionService;
  sync: PlayerSyncService;
  scores: ScoreService;
  boards: LeaderboardService;
}

let made: Services | null = null;

export function services(): Services {
  if (made) return made;
  const teams = new TeamService();
  const sync = new PlayerSyncService(teams.channel);
  const profiles = new PlayerProfileService();
  made = {
    profiles,
    teams,
    session: new MultiplayerSessionService(teams),
    sync,
    scores: new ScoreService(),
    boards: new LeaderboardService(),
  };
  // Names for the ghosts come from the team, not from the position updates.
  teams.snapshot.subscribe((snapshot) => sync.useTeam(snapshot));
  // The channel's presence carries the name the player goes by now.
  profiles.profile.subscribe((profile) => teams.setUser(teams.userId.get(), profile?.displayName ?? ''));
  // A counted run can change the best score and the number of games played.
  made.scores.accepted.subscribe((accepted) => {
    if (accepted) void profiles.refresh();
  });
  return made;
}

/** Reads an Observable in a component, the way React wants external state read. */
export function useObservable<T>(observable: Observable<T>): T {
  return useSyncExternalStore(observable.subscribe, () => observable.get());
}
