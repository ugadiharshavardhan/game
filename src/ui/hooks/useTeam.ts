/**
 * The team, as every screen reads it: one copy (the TeamService's snapshot of the database),
 * and the actions that change it.
 */
import { services, useObservable } from '../services';

export function useTeam() {
  const { teams } = services();
  const snapshot = useObservable(teams.snapshot);
  const loaded = useObservable(teams.loaded);
  const busy = useObservable(teams.busy);
  const error = useObservable(teams.error);
  const notice = useObservable(teams.notice);
  const userId = useObservable(teams.userId);
  const online = useObservable(teams.channel.online);
  const channelStatus = useObservable(teams.channel.status);

  const team = snapshot?.team ?? null;
  const members = snapshot?.members ?? [];
  return {
    snapshot,
    team,
    teamId: team?.id ?? null,
    teamCode: team?.code ?? null,
    teamName: team?.name ?? null,
    creator: team ? { id: team.creatorId, name: team.creatorName } : null,
    members,
    memberCount: members.length,
    me: teams.me(snapshot),
    userId,
    isCreator: teams.isCreator(snapshot),
    isHost: teams.isHost(snapshot),
    session: snapshot?.session ?? null,
    sessionPlayers: snapshot?.sessionPlayers ?? [],
    teamResult: snapshot?.teamResult ?? null,
    lobby: teams.lobbyStatus(snapshot),
    online,
    channelStatus,
    isLoading: !loaded && busy === 'loading',
    busy,
    error,
    notice,
    createTeam: (name: string) => teams.create(name),
    joinTeam: (code: string) => teams.join(code),
    leaveTeam: () => teams.leave(),
    refreshTeam: () => teams.refresh(),
    setReady: (ready: boolean) => teams.setReady(ready),
    startGame: () => teams.start(),
    clearError: () => teams.clearError(),
  };
}
