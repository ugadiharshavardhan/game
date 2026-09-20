/**
 * The referee. Teams, lobbies, sessions, ghost traffic and both leaderboards — the rules of the
 * multiplayer game, with no transport in them at all.
 *
 * The real server (`server/`) wraps this in a WebSocket; the same-device transport
 * (`LocalTransport`) wraps the very same class in a BroadcastChannel, so two tabs on one laptop
 * play by exactly the rules a deployed server would apply. Whatever a client claims about its own
 * score is recomputed here from the stats it sent, and it is this number that reaches a board.
 *
 * It knows nothing about Three.js, React, Node or the DOM.
 */
// Explicit extensions: this module is also loaded straight from source by the session server,
// which runs on Node's own TypeScript support and resolves paths the way the web does not.
import { makePlayerId, makeTeamCode, cleanCampus, cleanName, normaliseTeamCode } from '../shared/identity.ts';
import {
  DEFAULT_SESSION_CONFIG,
  type ClientMessage,
  type ErrorCode,
  type LeaderboardRow,
  type Leaderboards,
  type PeerState,
  type PlayerProfile,
  type RunSubmission,
  type ServerMessage,
  type SessionConfig,
  type TeamLeaderboardRow,
  type TeamMember,
  type TeamState,
} from '../shared/multiplayer.ts';
import { DEFAULT_RUN_LIMITS, DEFAULT_SCORE_WEIGHTS, scoreRun, validateStats, type RunLimits, type ScoreWeights } from '../shared/score.ts';

/** Somewhere to keep the boards between restarts: a file on the server, storage in a browser. */
export interface AuthorityStore {
  load(): PersistedState | null;
  save(state: PersistedState): void;
}

export interface PersistedState {
  players: Record<string, BestRun>;
  teams: Record<string, PersistedTeam>;
}

interface BestRun {
  playerId: string;
  displayName: string;
  campus: string;
  score: number;
  durationMs: number;
  at: number;
}

interface PersistedTeam {
  code: string;
  name: string;
  /** playerId → their best accepted score with this team. */
  scores: Record<string, number>;
  members: Record<string, string>;
}

interface Connection {
  id: string;
  playerId: string | null;
  profile: PlayerProfile | null;
  teamCode: string | null;
  send(message: ServerMessage): void;
}

interface LiveTeam extends TeamState {
  /** playerId → the run they have already had counted in this session. */
  submitted: Set<string>;
}

const BOARD_SIZE = 25;

export interface AuthorityOptions {
  config?: Partial<SessionConfig>;
  store?: AuthorityStore;
  weights?: ScoreWeights;
  limits?: RunLimits;
  now?: () => number;
  random?: () => number;
}

export class Authority {
  readonly config: SessionConfig;
  private readonly store: AuthorityStore | null;
  private readonly weights: ScoreWeights;
  private readonly limits: RunLimits;
  private readonly now: () => number;
  private readonly random: () => number;

  private readonly connections = new Map<string, Connection>();
  /** playerId → connection id, so a returning player finds their place again. */
  private readonly byPlayer = new Map<string, string>();
  private readonly teams = new Map<string, LiveTeam>();
  private readonly best = new Map<string, BestRun>();
  private readonly teamRecords = new Map<string, PersistedTeam>();

  constructor(options: AuthorityOptions = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...options.config };
    this.store = options.store ?? null;
    this.weights = options.weights ?? DEFAULT_SCORE_WEIGHTS;
    this.limits = options.limits ?? DEFAULT_RUN_LIMITS;
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    const saved = this.store?.load();
    if (saved) {
      for (const [id, run] of Object.entries(saved.players ?? {})) this.best.set(id, run);
      for (const [code, team] of Object.entries(saved.teams ?? {})) this.teamRecords.set(code, team);
    }
  }

  // ---- connections -----------------------------------------------------------------------------

  connect(id: string, send: (message: ServerMessage) => void): void {
    this.connections.set(id, { id, playerId: null, profile: null, teamCode: null, send });
  }

  disconnect(id: string): void {
    const c = this.connections.get(id);
    if (!c) return;
    this.connections.delete(id);
    if (!c.playerId) return;
    if (this.byPlayer.get(c.playerId) === id) this.byPlayer.delete(c.playerId);
    const team = c.teamCode ? this.teams.get(c.teamCode) : null;
    if (!team) return;
    const member = team.members.find((m) => m.playerId === c.playerId);
    if (member) member.online = false;
    // A lobby nobody has started loses the player entirely; a session in progress keeps their
    // place, so they can come back to the same village.
    if (!team.session) team.members = team.members.filter((m) => m.playerId !== c.playerId);
    if (team.members.length === 0) {
      this.teams.delete(team.code);
      return;
    }
    if (!team.members.some((m) => m.playerId === team.hostId)) team.hostId = team.members[0].playerId;
    this.sendTeam(team);
    this.toTeam(team, { type: 'peer-left', playerId: c.playerId }, c.playerId);
  }

  message(id: string, raw: ClientMessage): void {
    const c = this.connections.get(id);
    if (!c) return;
    switch (raw.type) {
      case 'hello':
        return this.hello(c, raw.profile);
      case 'create-team':
        return this.createTeam(c, raw.name);
      case 'join-team':
        return this.joinTeam(c, raw.code);
      case 'leave-team':
        return this.leaveTeam(c);
      case 'ready':
        return this.setReady(c, raw.ready);
      case 'start-session':
        return this.startSession(c);
      case 'sync':
        return this.sync(c, raw.state);
      case 'submit-run':
        return this.submitRun(c, raw.run);
      case 'leaderboards':
        return c.send({ type: 'leaderboards', boards: this.boards() });
      case 'ping':
        return c.send({ type: 'pong', serverTime: this.now() });
    }
  }

  /** Housekeeping: lobbies nobody ever started. */
  tick(): void {
    const now = this.now();
    for (const team of [...this.teams.values()]) {
      if (team.session || now - team.createdAt < this.config.lobbyTimeoutMs) continue;
      this.teams.delete(team.code);
      for (const m of team.members) {
        const conn = this.connectionOf(m.playerId);
        if (conn) {
          conn.teamCode = null;
          conn.send({ type: 'team', team: null });
        }
      }
    }
  }

  // ---- identity --------------------------------------------------------------------------------

  private hello(c: Connection, profile: PlayerProfile): void {
    const name = cleanName(profile?.displayName ?? '');
    if (!name) return this.fail(c, 'bad-name');
    // The id the browser made is honoured, but it has to look like one.
    const playerId = /^PLY_[A-Z0-9]{5,12}$/.test(profile.playerId) ? profile.playerId : makePlayerId(this.random);
    // One connection per player: a second tab with the same id replaces the first.
    const old = this.byPlayer.get(playerId);
    if (old && old !== c.id) {
      const previous = this.connections.get(old);
      if (previous) previous.playerId = null;
    }
    c.playerId = playerId;
    c.profile = { ...profile, playerId, displayName: name, campus: cleanCampus(profile.campus ?? '') };
    this.byPlayer.set(playerId, c.id);
    c.send({ type: 'welcome', playerId, config: this.config, serverTime: this.now() });

    // Coming back to a session they were already in.
    const team = [...this.teams.values()].find((t) => t.members.some((m) => m.playerId === playerId));
    if (team) {
      c.teamCode = team.code;
      const member = team.members.find((m) => m.playerId === playerId);
      if (member) {
        member.online = true;
        member.displayName = name;
      }
      this.sendTeam(team);
      if (team.session) c.send({ type: 'session', session: team.session });
    }
  }

  // ---- teams -----------------------------------------------------------------------------------

  private createTeam(c: Connection, rawName: string): void {
    if (!c.playerId || !c.profile) return this.fail(c, 'unknown');
    const name = cleanName(rawName) || `${c.profile.displayName}’s team`;
    this.leaveTeam(c, true);
    let code = makeTeamCode(this.random);
    while (this.teams.has(code)) code = makeTeamCode(this.random);
    const team: LiveTeam = {
      code,
      name,
      hostId: c.playerId,
      members: [this.memberOf(c.profile)],
      session: null,
      createdAt: this.now(),
      teamScore: 0,
      submitted: new Set(),
    };
    this.teams.set(code, team);
    c.teamCode = code;
    this.sendTeam(team);
  }

  private joinTeam(c: Connection, rawCode: string): void {
    if (!c.playerId || !c.profile) return this.fail(c, 'unknown');
    const code = normaliseTeamCode(rawCode);
    const team = this.teams.get(code);
    if (!team) return this.fail(c, 'team-not-found');
    const already = team.members.find((m) => m.playerId === c.playerId);
    if (!already) {
      if (team.members.length >= this.config.maxPlayers) return this.fail(c, 'team-full');
      if (team.session) return this.fail(c, 'team-started');
      team.members.push(this.memberOf(c.profile));
    } else {
      already.online = true;
    }
    this.leaveTeam(c, true, code);
    c.teamCode = code;
    this.sendTeam(team);
    if (team.session) c.send({ type: 'session', session: team.session });
  }

  private leaveTeam(c: Connection, quiet = false, except?: string): void {
    const code = c.teamCode;
    if (!code || code === except) return;
    const team = this.teams.get(code);
    c.teamCode = null;
    if (!team) return;
    team.members = team.members.filter((m) => m.playerId !== c.playerId);
    if (team.members.length === 0) this.teams.delete(code);
    else {
      if (!team.members.some((m) => m.playerId === team.hostId)) team.hostId = team.members[0].playerId;
      this.sendTeam(team);
      if (c.playerId) this.toTeam(team, { type: 'peer-left', playerId: c.playerId }, c.playerId);
    }
    if (!quiet) c.send({ type: 'team', team: null });
  }

  private setReady(c: Connection, ready: boolean): void {
    const team = this.teamOf(c);
    if (!team) return this.fail(c, 'not-in-team');
    const member = team.members.find((m) => m.playerId === c.playerId);
    if (member) member.ready = ready;
    this.sendTeam(team);
  }

  private startSession(c: Connection): void {
    const team = this.teamOf(c);
    if (!team) return this.fail(c, 'not-in-team');
    if (team.session) {
      c.send({ type: 'session', session: team.session });
      return;
    }
    if (team.hostId !== c.playerId) return this.fail(c, 'not-host');
    const here = team.members.filter((m) => m.online);
    if (here.length < this.config.minPlayers) return this.fail(c, 'not-enough-players');
    if (this.config.requireReady && !here.every((m) => m.ready)) return this.fail(c, 'not-everyone-ready');
    team.session = {
      sessionId: `SES_${Math.floor(this.random() * 1e9).toString(36).toUpperCase()}`,
      // One moon for the whole team: same seed, same clock.
      moonSeed: Math.floor(this.random() * 100000),
      startedAt: this.now(),
    };
    this.sendTeam(team);
    this.toTeam(team, { type: 'session', session: team.session });
  }

  // ---- the village -----------------------------------------------------------------------------

  private sync(c: Connection, state: Omit<PeerState, 'playerId' | 't'>): void {
    const team = this.teamOf(c);
    if (!team?.session || !c.playerId) return;
    const peer: PeerState = { ...state, playerId: c.playerId, t: this.now() };
    this.toTeam(team, { type: 'peers', peers: [peer] }, c.playerId);
  }

  // ---- scores ----------------------------------------------------------------------------------

  private submitRun(c: Connection, run: RunSubmission): void {
    if (!c.playerId || !c.profile) return this.fail(c, 'unknown');
    const reason = validateStats(run.stats, this.limits);
    if (reason) return this.fail(c, 'bad-run', reason);
    const team = this.teamOf(c);
    // One counted run per player per session; solo runs are deduplicated by their own best.
    if (team?.session && run.sessionId === team.session.sessionId) {
      if (team.submitted.has(c.playerId)) return this.fail(c, 'duplicate-run');
      team.submitted.add(c.playerId);
    }
    const { breakdown } = scoreRun(run.stats, this.weights);
    const score = breakdown.total;
    const previous = this.best.get(c.playerId);
    // A replay only counts if it is better: the board keeps one line per player.
    const personalBest = !previous || score > previous.score;
    if (personalBest) {
      this.best.set(c.playerId, {
        playerId: c.playerId,
        displayName: c.profile.displayName,
        campus: c.profile.campus,
        score,
        durationMs: run.stats.durationMs,
        at: this.now(),
      });
    }
    let teamScore: number | null = null;
    let teamRank: number | null = null;
    if (team) {
      const member = team.members.find((m) => m.playerId === c.playerId);
      if (member && (member.score === null || score > member.score)) {
        member.score = score;
        member.durationMs = run.stats.durationMs;
      }
      const record = this.teamRecords.get(team.code) ?? { code: team.code, name: team.name, scores: {}, members: {} };
      record.name = team.name;
      record.members[c.playerId] = c.profile.displayName;
      record.scores[c.playerId] = Math.max(record.scores[c.playerId] ?? 0, score);
      this.teamRecords.set(team.code, record);
      team.teamScore = this.teamScoreOf(record);
      teamScore = team.teamScore;
      teamRank = this.teamBoard().find((t) => t.code === team.code)?.rank ?? null;
      this.sendTeam(team);
    }
    this.persist();
    c.send({
      type: 'run-accepted',
      result: {
        score,
        breakdown,
        personalBest,
        bestScore: this.best.get(c.playerId)?.score ?? score,
        individualRank: this.individualBoard().find((r) => r.playerId === c.playerId)?.rank ?? null,
        teamScore,
        teamRank,
      },
    });
    c.send({ type: 'leaderboards', boards: this.boards() });
  }

  private teamScoreOf(record: PersistedTeam): number {
    const scores = Object.values(record.scores).sort((a, b) => b - a);
    const count = this.config.teamScoreCount > 0 ? this.config.teamScoreCount : scores.length;
    return scores.slice(0, count).reduce((n, s) => n + s, 0);
  }

  boards(): Leaderboards {
    return { individual: this.individualBoard(), teams: this.teamBoard() };
  }

  private individualBoard(): LeaderboardRow[] {
    return [...this.best.values()]
      .sort((a, b) => b.score - a.score || a.durationMs - b.durationMs)
      .slice(0, BOARD_SIZE)
      .map((r, i) => ({ rank: i + 1, playerId: r.playerId, displayName: r.displayName, campus: r.campus, score: r.score, durationMs: r.durationMs }));
  }

  private teamBoard(): TeamLeaderboardRow[] {
    return [...this.teamRecords.values()]
      .map((t) => ({ code: t.code, name: t.name, members: Object.keys(t.members).length, teamScore: this.teamScoreOf(t) }))
      .filter((t) => t.teamScore > 0)
      .sort((a, b) => b.teamScore - a.teamScore)
      .slice(0, BOARD_SIZE)
      .map((t, i) => ({ rank: i + 1, ...t }));
  }

  // ---- plumbing --------------------------------------------------------------------------------

  private memberOf(profile: PlayerProfile): TeamMember {
    return { playerId: profile.playerId, displayName: profile.displayName, campus: profile.campus, ready: false, online: true, score: null, durationMs: null };
  }

  private teamOf(c: Connection): LiveTeam | null {
    return c.teamCode ? (this.teams.get(c.teamCode) ?? null) : null;
  }

  private connectionOf(playerId: string): Connection | null {
    const id = this.byPlayer.get(playerId);
    return id ? (this.connections.get(id) ?? null) : null;
  }

  private sendTeam(team: LiveTeam): void {
    const state: TeamState = {
      code: team.code,
      name: team.name,
      hostId: team.hostId,
      members: team.members.map((m) => ({ ...m })),
      session: team.session,
      createdAt: team.createdAt,
      teamScore: team.teamScore,
    };
    this.toTeam(team, { type: 'team', team: state });
  }

  private toTeam(team: LiveTeam, message: ServerMessage, except?: string): void {
    for (const m of team.members) {
      if (m.playerId === except) continue;
      this.connectionOf(m.playerId)?.send(message);
    }
  }

  private fail(c: Connection, code: ErrorCode, detail?: string): void {
    c.send({ type: 'error', code, message: detail ? `${code}: ${detail}` : code });
  }

  private persist(): void {
    if (!this.store) return;
    this.store.save({
      players: Object.fromEntries(this.best),
      teams: Object.fromEntries(this.teamRecords),
    });
  }
}
