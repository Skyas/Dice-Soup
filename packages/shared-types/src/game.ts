/**
 * @module game
 * 游戏会话、角色、状态相关的共享类型。
 */

// ─── 游戏类型 ────────────────────────────────────────────────────────────────

export type GameType = 'soup' | 'avalon' | 'undercover' | 'trpg_coc7';

// ─── 会话状态 ────────────────────────────────────────────────────────────────

export type SessionState = 'pending' | 'running' | 'ended' | 'aborted';

export type SessionEndReason =
  | 'normal'
  | 'aborted_by_kp'
  | 'aborted_by_admin'
  | 'kp_timeout'
  | 'all_left'
  | 'pending_timeout';

// ─── 用户角色（RBAC） ────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'kp' | 'player' | 'guest';

// ─── 群设置（rooms.settings_json） ──────────────────────────────────────────

export interface RoomSettings {
  commandPrefix?: string;
  disabledGames?: GameType[];
  customAnnouncement?: string;
}

// ─── 成员状态（session_members.state_json，按 game_type 分支） ─────────────

export interface SoupMemberState {
  questionsAsked: number;
  contributionScore: number;
}

export interface AvalonMemberState {
  roleId: string;
  revealed: boolean;
}

export interface UndercoverMemberState {
  word: string;
  isUndercover: boolean;
  eliminated: boolean;
}

export interface Coc7MemberState {
  characterId: string;
  currentSanity: number;
}

// ─── 互斥错误详情 ────────────────────────────────────────────────────────────

export interface BusySessionInfo {
  gameType: GameType;
  startedAt: number | null;
  kp: string | null;
}
