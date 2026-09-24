/**
 * The contract between the game and whatever is running the session: player identity, teams,
 * lobbies, the shared village, and the two leaderboards.
 *
 * Nothing here imports the engine, React or Node — the browser client, the local same-device
 * transport and the real server all speak exactly these messages, so the backend can be replaced
 * without touching the game.
 *
 * Identity is deliberately thin: a name, optionally a campus, and an id this code makes up. No
 * accounts, no email, no password, no phone. Two players called Harsha are told apart by the id,
 * never by the name.
 */
import type { RunStats, ScoreBreakdown } from './types.ts';

export type CharacterModel = 'devotee' | 'woman' | 'pujari';
export type PlayerGender = 'male' | 'female' | 'other';

export interface PlayerProfile {
  /** `PLY_8F72K91` — made once, kept in this browser, and the only thing that identifies a player. */
  playerId: string;
  displayName: string;
  /** Optional, for the contest's campus column. */
  campus: string;
  gender?: PlayerGender;
  character?: CharacterModel;
  createdAt: number;
  bestIndividualScore: number;
  gamesPlayed: number;
}

export interface TeamMember {
  playerId: string;
  displayName: string;
  campus: string;
  ready: boolean;
  /** False while they are away: their ghost fades but their place is kept. */
  online: boolean;
  /** Their finished run in this session, once the server has accepted it. */
  score: number | null;
  durationMs: number | null;
}

export interface SessionInfo {
  sessionId: string;
  /** Everybody's moon is this moon: same seed, same clock. */
  moonSeed: number;
  /** Server time the village opened, in epoch milliseconds. */
  startedAt: number;
}

export interface TeamState {
  code: string;
  name: string;
  hostId: string;
  members: TeamMember[];
  /** The session everyone is in, once the lobby has started. */
  session: SessionInfo | null;
  /** Server time this lobby was made, for the timeout. */
  createdAt: number;
  teamScore: number;
}

/** Everything the lobby's rules allow, decided by the server and sent to the client. */
export interface SessionConfig {
  minPlayers: number;
  maxPlayers: number;
  /** Everyone must press READY before the host can start. */
  requireReady: boolean;
  /** A lobby nobody starts is forgotten after this long. */
  lobbyTimeoutMs: number;
  /** How often a player tells the others where they are. */
  syncHz: number;
  /** How a team's score is made from its members' runs. */
  teamScore: 'sum-of-best';
  /** How many scores count toward it (0 = all of them). */
  teamScoreCount: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  minPlayers: 1,
  maxPlayers: 4,
  requireReady: true,
  lobbyTimeoutMs: 30 * 60 * 1000,
  syncHz: 10,
  teamScore: 'sum-of-best',
  teamScoreCount: 0,
};

/** What a teammate looks like from the outside: enough to draw a ghost, and nothing more. */
export interface PeerState {
  playerId: string;
  /** Position and heading, rounded to the centimetre and the degree before they are sent. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Their animation: idle, walking, running, sneaking, interacting, hidden (indoors). */
  state: string;
  /** Inside a shelter: the ghost is not drawn in the lane. */
  indoors: boolean;
  /** Offerings given, for the lobby's little progress line. */
  given: number;
  /** Server time this state was sent. */
  t: number;
}

/** A teammate as the renderer wants them: smoothed, with the jitter of the network taken out. */
export interface RemotePeer {
  playerId: string;
  displayName: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: string;
  indoors: boolean;
  /** 0..1 — fades in when they arrive and out when they go quiet. */
  presence: number;
}

export interface LeaderboardRow {
  rank: number;
  playerId: string;
  displayName: string;
  campus: string;
  score: number;
  durationMs: number;
  /** Whether that best run finished the puja. Absent on rows saved before it was recorded. */
  complete?: boolean;
  /** Offerings that run gathered. */
  items?: number;
}

export interface TeamLeaderboardRow {
  rank: number;
  code: string;
  name: string;
  members: number;
  teamScore: number;
}

export interface Leaderboards {
  individual: LeaderboardRow[];
  teams: TeamLeaderboardRow[];
}

/** A finished run, as the client offers it. The server keeps what it can verify, not this. */
export interface RunSubmission {
  playerId: string;
  sessionId: string | null;
  stats: RunStats;
  /** The client's own arithmetic — recorded only to notice when it disagrees with the server's. */
  claimedScore: number;
}

export interface RunAccepted {
  /** What the server scored the run: this is the number that counts. */
  score: number;
  breakdown: ScoreBreakdown;
  personalBest: boolean;
  bestScore: number;
  individualRank: number | null;
  teamScore: number | null;
  teamRank: number | null;
}

// ---- messages ----------------------------------------------------------------------------------

export type ClientMessage =
  | { type: 'hello'; profile: PlayerProfile }
  | { type: 'create-team'; name: string }
  | { type: 'join-team'; code: string }
  | { type: 'leave-team' }
  | { type: 'ready'; ready: boolean }
  | { type: 'start-session' }
  | { type: 'sync'; state: Omit<PeerState, 'playerId' | 't'> }
  | { type: 'submit-run'; run: RunSubmission }
  | { type: 'leaderboards' }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'welcome'; playerId: string; config: SessionConfig; serverTime: number }
  | { type: 'team'; team: TeamState | null }
  | { type: 'session'; session: SessionInfo }
  | { type: 'peers'; peers: PeerState[] }
  | { type: 'peer-left'; playerId: string }
  | { type: 'run-accepted'; result: RunAccepted }
  | { type: 'leaderboards'; boards: Leaderboards }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'pong'; serverTime: number };

export type ErrorCode =
  | 'team-not-found'
  | 'team-full'
  | 'team-started'
  | 'not-in-team'
  | 'not-host'
  | 'not-enough-players'
  | 'not-everyone-ready'
  | 'bad-name'
  | 'bad-run'
  | 'duplicate-run'
  | 'unknown';

export const ERROR_TEXT: Record<ErrorCode, string> = {
  'team-not-found': 'Team code not found.',
  'team-full': 'Team is full.',
  'team-started': 'That team has already started playing.',
  'not-in-team': 'You are not in a team.',
  'not-host': 'Only the player who made the team can start it.',
  'not-enough-players': 'Not enough players yet.',
  'not-everyone-ready': 'Everyone has to be ready.',
  'bad-name': 'Please enter a name.',
  'bad-run': 'That run could not be verified.',
  'duplicate-run': 'That run has already been counted.',
  unknown: 'Something went wrong.',
};
