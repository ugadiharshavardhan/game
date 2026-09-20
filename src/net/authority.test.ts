import { describe, expect, it } from 'vitest';
import type { PlayerProfile, ServerMessage, TeamState } from '../shared/multiplayer';
import type { RunStats } from '../shared/types';
import { Authority, type AuthorityOptions } from './Authority';

/** A deterministic referee and a handful of clients wired into it. */
function table(options: AuthorityOptions = {}) {
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let clock = 1_700_000_000_000;
  const authority = new Authority({ ...options, random, now: () => clock });

  const join = (name: string, campus = 'Hyderabad') => {
    const id = `conn-${name}`;
    const inbox: ServerMessage[] = [];
    authority.connect(id, (m) => inbox.push(m));
    const profile: PlayerProfile = {
      playerId: `PLY_${name.toUpperCase().padEnd(5, 'X').slice(0, 7)}`,
      displayName: name,
      campus,
      createdAt: clock,
      bestIndividualScore: 0,
      gamesPlayed: 0,
    };
    authority.message(id, { type: 'hello', profile });
    return {
      id,
      profile,
      inbox,
      send: (m: Parameters<typeof authority.message>[1]) => authority.message(id, m),
      last: <T extends ServerMessage['type']>(type: T) =>
        [...inbox].reverse().find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined,
      team: () => ([...inbox].reverse().find((m) => m.type === 'team') as Extract<ServerMessage, { type: 'team' }> | undefined)?.team ?? null,
    };
  };

  return { authority, join, tick: (ms: number) => (clock += ms) };
}

const goodRun = (over: Partial<RunStats> = {}): RunStats => ({
  itemsCollected: 25,
  itemsLost: 0,
  shelterEvents: 2,
  moonlightEncounters: 2,
  overwhelmed: 0,
  durationMs: 8 * 60_000,
  distanceTravelled: 1200,
  exposedSeconds: 40,
  ...over,
});

describe('teams', () => {
  it('gives a readable code and puts the maker in it', () => {
    const t = table();
    const harsha = t.join('Harsha');
    harsha.send({ type: 'create-team', name: 'Moon Warriors' });
    const team = harsha.team() as TeamState;
    expect(team.code).toMatch(/^MOON-[A-Z0-9]{4}$/);
    expect(team.name).toBe('Moon Warriors');
    expect(team.members.map((m) => m.displayName)).toEqual(['Harsha']);
    expect(team.hostId).toBe(harsha.profile.playerId);
  });

  it('lets friends in by code, however they type it', () => {
    const t = table();
    const harsha = t.join('Harsha');
    harsha.send({ type: 'create-team', name: 'Moon Warriors' });
    const code = (harsha.team() as TeamState).code;
    const arjun = t.join('Arjun');
    arjun.send({ type: 'join-team', code: code.toLowerCase().replace('-', ' ') });
    expect(arjun.team()?.members.map((m) => m.displayName)).toEqual(['Harsha', 'Arjun']);
    // Everyone in the team hears about it.
    expect(harsha.team()?.members).toHaveLength(2);
  });

  it('says so when the code is wrong or the team is full', () => {
    const t = table({ config: { maxPlayers: 2 } });
    const harsha = t.join('Harsha');
    harsha.send({ type: 'create-team', name: 'Moon Warriors' });
    const code = (harsha.team() as TeamState).code;
    const stranger = t.join('Nobody');
    stranger.send({ type: 'join-team', code: 'MOON-ZZZZ' });
    expect(stranger.last('error')?.code).toBe('team-not-found');
    t.join('Arjun').send({ type: 'join-team', code });
    const late = t.join('Rahul');
    late.send({ type: 'join-team', code });
    expect(late.last('error')?.code).toBe('team-full');
  });

  it('will not start until the rules are met, and only for the host', () => {
    const t = table({ config: { minPlayers: 2, requireReady: true } });
    const harsha = t.join('Harsha');
    harsha.send({ type: 'create-team', name: 'Moon Warriors' });
    const code = (harsha.team() as TeamState).code;
    harsha.send({ type: 'start-session' });
    expect(harsha.last('error')?.code).toBe('not-enough-players');

    const arjun = t.join('Arjun');
    arjun.send({ type: 'join-team', code });
    harsha.send({ type: 'start-session' });
    expect(harsha.last('error')?.code).toBe('not-everyone-ready');

    harsha.send({ type: 'ready', ready: true });
    arjun.send({ type: 'ready', ready: true });
    arjun.send({ type: 'start-session' });
    expect(arjun.last('error')?.code).toBe('not-host');

    harsha.send({ type: 'start-session' });
    const session = harsha.last('team')?.team?.session;
    expect(session).toBeTruthy();
    // Everyone gets the same village, with the same moon.
    expect(arjun.last('session')?.session.sessionId).toBe(session?.sessionId);
    expect(arjun.last('session')?.session.moonSeed).toBe(session?.moonSeed);
  });

  it('keeps a player’s place in a session they drop out of, but not in a lobby', () => {
    const t = table({ config: { minPlayers: 1, requireReady: false } });
    const harsha = t.join('Harsha');
    harsha.send({ type: 'create-team', name: 'Moon Warriors' });
    const code = (harsha.team() as TeamState).code;
    const arjun = t.join('Arjun');
    arjun.send({ type: 'join-team', code });

    t.authority.disconnect(arjun.id);
    expect(harsha.team()?.members.map((m) => m.displayName), 'a lobby forgets them').toEqual(['Harsha']);

    const rahul = t.join('Rahul');
    rahul.send({ type: 'join-team', code });
    harsha.send({ type: 'start-session' });
    t.authority.disconnect(rahul.id);
    const after = harsha.team() as TeamState;
    expect(after.members.map((m) => m.displayName), 'a session keeps them').toEqual(['Harsha', 'Rahul']);
    expect(after.members.find((m) => m.displayName === 'Rahul')?.online).toBe(false);
    expect(after.session, 'and the session goes on').toBeTruthy();
  });

  it('forgets a lobby nobody ever started', () => {
    const t = table({ config: { lobbyTimeoutMs: 1000 } });
    const harsha = t.join('Harsha');
    harsha.send({ type: 'create-team', name: 'Moon Warriors' });
    t.tick(2000);
    t.authority.tick();
    expect(harsha.team()).toBeNull();
  });
});

describe('the village', () => {
  const started = () => {
    const t = table({ config: { minPlayers: 1, requireReady: false } });
    const harsha = t.join('Harsha');
    harsha.send({ type: 'create-team', name: 'Moon Warriors' });
    const code = (harsha.team() as TeamState).code;
    const arjun = t.join('Arjun');
    arjun.send({ type: 'join-team', code });
    harsha.send({ type: 'start-session' });
    return { t, harsha, arjun, code };
  };

  it('passes a player’s position to their teammates and nobody else', () => {
    const { harsha, arjun } = started();
    const outsider = started().harsha;
    harsha.send({ type: 'sync', state: { x: 1, y: 0, z: 2, yaw: 0.5, state: 'walking', indoors: false, given: 3 } });
    const peers = arjun.last('peers')?.peers;
    expect(peers?.[0]).toMatchObject({ playerId: harsha.profile.playerId, x: 1, z: 2, state: 'walking', given: 3 });
    expect(harsha.last('peers'), 'never back to the sender').toBeUndefined();
    expect(outsider.last('peers')).toBeUndefined();
  });
});

describe('scores', () => {
  const started = (config = {}) => {
    const t = table({ config: { minPlayers: 1, requireReady: false, ...config } });
    const harsha = t.join('Harsha', 'Vijayawada');
    harsha.send({ type: 'create-team', name: 'Moon Warriors' });
    const code = (harsha.team() as TeamState).code;
    const arjun = t.join('Arjun', 'Hyderabad');
    arjun.send({ type: 'join-team', code });
    harsha.send({ type: 'start-session' });
    const sessionId = (harsha.team() as TeamState).session?.sessionId ?? null;
    return { t, harsha, arjun, sessionId };
  };

  it('scores the run itself and ignores what the client claims', () => {
    const { harsha, sessionId } = started();
    harsha.send({ type: 'submit-run', run: { playerId: harsha.profile.playerId, sessionId, stats: goodRun(), claimedScore: 999999 } });
    const accepted = harsha.last('run-accepted')?.result;
    expect(accepted?.score).toBeGreaterThan(0);
    expect(accepted?.score).toBeLessThan(5000);
    expect(harsha.last('leaderboards')?.boards.individual[0].score).toBe(accepted?.score);
  });

  it('refuses a run that could not have happened', () => {
    const { harsha, sessionId } = started();
    const bad: Array<[string, RunStats]> = [
      ['too fast', goodRun({ durationMs: 5000 })],
      ['negative time', goodRun({ durationMs: -1 })],
      ['puja not finished', goodRun({ itemsCollected: 4 })],
      ['inventory invented', goodRun({ itemsCollected: 5000 })],
      ['never walked', goodRun({ distanceTravelled: 0 })],
      ['exposed longer than the run', goodRun({ exposedSeconds: 10_000 })],
    ];
    for (const [why, stats] of bad) {
      harsha.send({ type: 'submit-run', run: { playerId: harsha.profile.playerId, sessionId, stats, claimedScore: 1 } });
      expect(harsha.last('error')?.code, why).toBe('bad-run');
    }
    expect(harsha.last('run-accepted')).toBeUndefined();
  });

  it('counts one run per player per session', () => {
    const { harsha, sessionId } = started();
    const run = { playerId: harsha.profile.playerId, sessionId, stats: goodRun(), claimedScore: 0 };
    harsha.send({ type: 'submit-run', run });
    harsha.send({ type: 'submit-run', run });
    expect(harsha.last('error')?.code).toBe('duplicate-run');
  });

  it('keeps only a player’s best, however often they play again', () => {
    const { harsha } = started();
    const submit = (stats: RunStats) => harsha.send({ type: 'submit-run', run: { playerId: harsha.profile.playerId, sessionId: null, stats, claimedScore: 0 } });
    submit(goodRun({ durationMs: 9 * 60_000 }));
    const first = harsha.last('run-accepted')?.result?.score ?? 0;
    submit(goodRun({ durationMs: 12 * 60_000, distanceTravelled: 3000 })); // a worse run
    const second = harsha.last('run-accepted')?.result;
    expect(second?.score).toBeLessThan(first);
    expect(second?.personalBest).toBe(false);
    expect(second?.bestScore).toBe(first);
    const board = harsha.last('leaderboards')?.boards.individual ?? [];
    expect(board.filter((r) => r.playerId === harsha.profile.playerId)).toHaveLength(1);
    expect(board[0].score).toBe(first);
  });

  it('adds the team’s scores up without mixing the two boards', () => {
    const { harsha, arjun, sessionId } = started();
    harsha.send({ type: 'submit-run', run: { playerId: harsha.profile.playerId, sessionId, stats: goodRun(), claimedScore: 0 } });
    arjun.send({ type: 'submit-run', run: { playerId: arjun.profile.playerId, sessionId, stats: goodRun({ durationMs: 9 * 60_000 }), claimedScore: 0 } });
    const mine = harsha.last('run-accepted')?.result?.score ?? 0;
    const theirs = arjun.last('run-accepted')?.result?.score ?? 0;
    const boards = arjun.last('leaderboards')?.boards;
    expect(boards?.teams[0].teamScore).toBe(mine + theirs);
    expect(boards?.teams[0].members).toBe(2);
    expect(boards?.individual).toHaveLength(2);
    expect(boards?.individual.map((r) => r.campus)).toContain('Vijayawada');
    // The individual board has no team rows in it and vice versa.
    const row = boards?.individual[0] as unknown as { teamScore?: number } | undefined;
    expect(row?.teamScore).toBeUndefined();
  });

  it('remembers the boards across a restart', () => {
    let saved: string | null = null;
    const store = {
      load: () => (saved ? JSON.parse(saved) : null),
      save: (state: unknown) => {
        saved = JSON.stringify(state);
      },
    };
    const first = new Authority({ store, config: { minPlayers: 1, requireReady: false } });
    const inbox: ServerMessage[] = [];
    first.connect('a', (m) => inbox.push(m));
    const profile: PlayerProfile = { playerId: 'PLY_ABCDEFG', displayName: 'Harsha', campus: 'Guntur', createdAt: 0, bestIndividualScore: 0, gamesPlayed: 0 };
    first.message('a', { type: 'hello', profile });
    first.message('a', { type: 'submit-run', run: { playerId: profile.playerId, sessionId: null, stats: goodRun(), claimedScore: 0 } });

    const second = new Authority({ store });
    expect(second.boards().individual[0].displayName).toBe('Harsha');
  });
});
