/**
 * The team system's data, as the game sees it: players, teams, rounds, results and the two
 * leaderboards. Postgres (see `supabase/migrations/`) holds every one of these; the client only
 * ever keeps a copy it can throw away and fetch again.
 *
 * Nothing here imports the engine or React, so the game can draw teammates without knowing
 * where they came from.
 */
import type { ScoreBreakdown } from './types.ts';

export type CharacterModel = 'devotee' | 'woman' | 'pujari';
export type PlayerGender = 'male' | 'female' | 'other';

export interface PlayerProfile {
  /** The verified auth `sub` (a Clerk user id): the only thing that identifies a player. */
  id: string;
  username: string;
  displayName: string;
  /** Optional, for the contest's campus column. */
  campus: string;
  gender?: PlayerGender;
  character?: CharacterModel;
  createdAt: string;
  lastActiveAt?: string;
  bestIndividualScore?: number;
  bestScore?: number;
  gamesPlayed?: number;
}

export type IndividualLeaderboardRow = LeaderboardRow;

export type TeamStatus = 'waiting' | 'in_game' | 'closed';
export type MemberRole = 'creator' | 'host' | 'member';

export interface Team {
  id: string;
  name: string;
  /** Six characters from ABCDEFGHJKLMNPQRSTUVWXYZ23456789. */
  code: string;
  creatorId: string;
  creatorName: string | null;
  /** Who runs the lobby now: the creator, until they leave. */
  hostId: string;
  status: TeamStatus;
  maxMembers: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  userId: string;
  displayName: string;
  role: MemberRole;
  isReady: boolean;
  joinedAt: string;
}

export type SessionStatus = 'lobby' | 'in_progress' | 'completed' | 'abandoned';

export interface GameSession {
  id: string;
  status: SessionStatus;
  /** Everybody's moon is this moon: same seed, same clock. */
  moonSeed: number;
  createdBy: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export type CompletionState = 'playing' | 'completed' | 'dnf' | 'abandoned';

export interface SessionPlayer {
  userId: string;
  displayName: string;
  completionState: CompletionState;
  isConnected: boolean;
  joinedAt: string;
  lastSeenAt: string;
  /** Their counted run in this round, once the database has accepted it. */
  score: number | null;
  completionTimeMs: number | null;
  completed: boolean | null;
}

export interface TeamResult {
  teamScore: number;
  completedPlayers: number;
  submittedPlayers: number;
  teamCompletionTimeMs: number | null;
  isFinal: boolean;
  calculatedAt: string;
}

/** Everything a lobby shows, read in one go from `get_my_team()`. */
export interface TeamSnapshot {
  team: Team;
  members: TeamMember[];
  /** The open round, or the most recent finished one. */
  session: GameSession | null;
  sessionPlayers: SessionPlayer[];
  teamResult: TeamResult | null;
  /** Database clock when this was read, epoch ms. */
  serverTime: number;
}

/** What a stranger may learn from a code before joining. */
export interface TeamPreview {
  name: string;
  code: string;
  status: TeamStatus;
  maxMembers: number;
  memberCount: number;
  creatorName: string | null;
}

/** A counted run, as the database scored it. */
export interface RunAccepted {
  resultId: string;
  score: number;
  breakdown: ScoreBreakdown;
  personalBest: boolean;
  bestScore: number;
  individualRank: number | null;
  teamScore: number | null;
  teamRank: number | null;
}

export interface LeaderboardRow {
  rank: number;
  displayName: string;
  campus: string;
  score: number;
  durationMs: number;
  complete: boolean;
  items: number;
  attempts: number;
  isMe: boolean;
}

export interface TeamLeaderboardRow {
  rank: number;
  teamId: string;
  name: string;
  teamScore: number;
  completedPlayers: number;
  players: number;
  completionTimeMs: number | null;
  createdAt: string;
  isMine: boolean;
}

export interface Leaderboards {
  individual: LeaderboardRow[];
  teams: TeamLeaderboardRow[];
}

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

// ---- errors ------------------------------------------------------------------------------------

/** The stable codes the database functions raise (see 20260924082109_functions.sql). */
export type ErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'PROFILE_REQUIRED'
  | 'PROFILE_FAILED'
  | 'BAD_NAME'
  | 'ALREADY_IN_TEAM'
  | 'ALREADY_MEMBER'
  | 'TEAM_NOT_FOUND'
  | 'TEAM_CLOSED'
  | 'TEAM_FULL'
  | 'TEAM_STARTED'
  | 'NOT_IN_TEAM'
  | 'NOT_HOST'
  | 'NOT_EVERYONE_READY'
  | 'SESSION_IN_PROGRESS'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'NOT_IN_SESSION'
  | 'DUPLICATE_RUN'
  | 'BAD_RUN'
  | 'RATE_LIMITED'
  | 'CODE_GENERATION_FAILED'
  | 'GAME_ALREADY_STARTED'
  | 'NOT_TEAM_CREATOR'
  | 'INVALID_TEAM_NAME'
  | 'INVALID_TEAM_CODE'
  | 'DATABASE_SETUP_REQUIRED'
  | 'AUTH_REJECTED'
  | 'NETWORK';

export const ERROR_TEXT: Record<ErrorCode, string> = {
  NOT_AUTHENTICATED: 'Please log in with Google before joining a team.',
  PROFILE_REQUIRED: 'Please enter your name before playing.',
  PROFILE_FAILED: 'We couldn’t save your name. Please try again.',
  BAD_NAME: 'Please enter a valid team name.',
  ALREADY_IN_TEAM: 'You are already in an active team. Leave that team before joining another.',
  ALREADY_MEMBER: 'You are already a member of this team.',
  TEAM_NOT_FOUND: 'Team not found. Please check the 6-character code.',
  TEAM_CLOSED: 'This team has been closed.',
  TEAM_FULL: 'This team is full (4/4 players).',
  TEAM_STARTED: 'This team has already started the game.',
  GAME_ALREADY_STARTED: 'This team has already started the game.',
  NOT_TEAM_CREATOR: 'Only the team creator can start the game.',
  INVALID_TEAM_NAME: 'Please enter a valid team name (1-24 characters).',
  INVALID_TEAM_CODE: 'Please enter a 6-character team code.',
  DATABASE_SETUP_REQUIRED: 'Database setup required: please run the SQL migration in Supabase SQL editor.',
  NOT_IN_TEAM: 'You are not in a team.',
  NOT_HOST: 'Only the team host can start the game.',
  NOT_EVERYONE_READY: 'Everyone has to be ready before the game can start.',
  SESSION_IN_PROGRESS: 'Your team is still playing the current round.',
  SESSION_NOT_FOUND: 'That round could not be found.',
  SESSION_CLOSED: 'That round has already ended.',
  NOT_IN_SESSION: 'You are not playing in that round.',
  DUPLICATE_RUN: 'That run has already been counted.',
  BAD_RUN: 'That run could not be verified.',
  RATE_LIMITED: 'Please wait a moment before submitting another run.',
  CODE_GENERATION_FAILED: 'We couldn’t make a team code. Please try again.',
  AUTH_REJECTED: 'Your sign-in could not be verified. Please sign out and in again.',
  NETWORK: 'Unable to connect to the database. Check your connection and try again.',
};
