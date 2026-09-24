/**
 * The database speaks snake_case JSON; the game speaks the types in `shared/multiplayer.ts`.
 * These are the only places the two meet.
 */
import type {
  CompletionState,
  GameSession,
  LeaderboardRow,
  MemberRole,
  PlayerProfile,
  RunAccepted,
  SessionPlayer,
  SessionStatus,
  TeamLeaderboardRow,
  TeamMember,
  TeamPreview,
  TeamResult,
  TeamSnapshot,
  TeamStatus,
} from '../shared/multiplayer';
import type { ScoreBreakdown } from '../shared/types';

export interface RawProfile {
  id: string;
  username: string;
  display_name: string;
  campus: string;
  created_at: string;
  last_active_at: string;
}

interface RawTeam {
  id: string;
  team_name: string;
  team_code: string;
  creator_id: string;
  creator_name: string | null;
  host_id: string;
  status: TeamStatus;
  max_members: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RawMember {
  user_id: string;
  display_name: string;
  role: MemberRole;
  is_ready: boolean;
  joined_at: string;
}

interface RawSession {
  id: string;
  status: SessionStatus;
  moon_seed: number;
  created_by: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

interface RawSessionPlayer {
  user_id: string;
  display_name: string;
  completion_state: CompletionState;
  is_connected: boolean;
  joined_at: string;
  last_seen_at: string;
  score: number | null;
  completion_time_ms: number | null;
  completed: boolean | null;
}

interface RawTeamResult {
  team_score: number;
  completed_players: number;
  submitted_players: number;
  team_completion_time_ms: number | null;
  is_final: boolean;
  calculated_at: string;
}

export interface RawSnapshot {
  server_time: string;
  team: RawTeam;
  members: RawMember[];
  session: RawSession | null;
  session_players: RawSessionPlayer[];
  team_result: RawTeamResult | null;
}

export interface RawPreview {
  team_name: string;
  team_code: string;
  status: TeamStatus;
  max_members: number;
  member_count: number;
  creator_name: string | null;
}

export interface RawRunAccepted {
  result_id: string;
  score: number;
  breakdown: ScoreBreakdown;
  personal_best: boolean;
  best_score: number;
  individual_rank: number | null;
  team_score: number | null;
  team_rank: number | null;
}

export interface RawIndividualRow {
  rank: number;
  display_name: string;
  campus: string;
  score: number;
  completion_time_ms: number;
  completed: boolean;
  items_collected: number;
  attempts: number;
  is_me: boolean;
}

export interface RawTeamRow {
  rank: number;
  team_id: string;
  team_name: string;
  team_score: number;
  completed_players: number;
  players: number;
  team_completion_time_ms: number | null;
  created_at: string;
  is_mine: boolean;
}

export function toProfile(raw: RawProfile): PlayerProfile {
  return {
    id: raw.id,
    username: raw.username,
    displayName: raw.display_name,
    campus: raw.campus,
    createdAt: raw.created_at,
    lastActiveAt: raw.last_active_at,
  };
}

function toMember(raw: RawMember): TeamMember {
  return { userId: raw.user_id, displayName: raw.display_name, role: raw.role, isReady: raw.is_ready, joinedAt: raw.joined_at };
}

function toSession(raw: RawSession): GameSession {
  return {
    id: raw.id,
    status: raw.status,
    moonSeed: raw.moon_seed,
    createdBy: raw.created_by,
    startedAt: raw.started_at,
    endedAt: raw.ended_at,
    createdAt: raw.created_at,
  };
}

function toSessionPlayer(raw: RawSessionPlayer): SessionPlayer {
  return {
    userId: raw.user_id,
    displayName: raw.display_name,
    completionState: raw.completion_state,
    isConnected: raw.is_connected,
    joinedAt: raw.joined_at,
    lastSeenAt: raw.last_seen_at,
    score: raw.score,
    completionTimeMs: raw.completion_time_ms,
    completed: raw.completed,
  };
}

function toTeamResult(raw: RawTeamResult): TeamResult {
  return {
    teamScore: raw.team_score,
    completedPlayers: raw.completed_players,
    submittedPlayers: raw.submitted_players,
    teamCompletionTimeMs: raw.team_completion_time_ms,
    isFinal: raw.is_final,
    calculatedAt: raw.calculated_at,
  };
}

export function toSnapshot(raw: RawSnapshot): TeamSnapshot {
  const t = raw.team;
  return {
    team: {
      id: t.id,
      name: t.team_name,
      code: t.team_code,
      creatorId: t.creator_id,
      creatorName: t.creator_name,
      hostId: t.host_id,
      status: t.status,
      maxMembers: t.max_members,
      isActive: t.is_active,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    },
    members: raw.members.map(toMember),
    session: raw.session ? toSession(raw.session) : null,
    sessionPlayers: raw.session_players.map(toSessionPlayer),
    teamResult: raw.team_result ? toTeamResult(raw.team_result) : null,
    serverTime: Date.parse(raw.server_time),
  };
}

export function toPreview(raw: RawPreview): TeamPreview {
  return {
    name: raw.team_name,
    code: raw.team_code,
    status: raw.status,
    maxMembers: raw.max_members,
    memberCount: raw.member_count,
    creatorName: raw.creator_name,
  };
}

export function toRunAccepted(raw: RawRunAccepted): RunAccepted {
  return {
    resultId: raw.result_id,
    score: raw.score,
    breakdown: raw.breakdown,
    personalBest: raw.personal_best,
    bestScore: raw.best_score,
    individualRank: raw.individual_rank,
    teamScore: raw.team_score,
    teamRank: raw.team_rank,
  };
}

export function toIndividualRow(raw: RawIndividualRow): LeaderboardRow {
  return {
    rank: raw.rank,
    displayName: raw.display_name,
    campus: raw.campus,
    score: raw.score,
    durationMs: raw.completion_time_ms,
    complete: raw.completed,
    items: raw.items_collected,
    attempts: raw.attempts,
    isMe: raw.is_me,
  };
}

export function toTeamRow(raw: RawTeamRow): TeamLeaderboardRow {
  return {
    rank: raw.rank,
    teamId: raw.team_id,
    name: raw.team_name,
    teamScore: raw.team_score,
    completedPlayers: raw.completed_players,
    players: raw.players,
    completionTimeMs: raw.team_completion_time_ms,
    createdAt: raw.created_at,
    isMine: raw.is_mine,
  };
}
