/**
 * @module game-common/types
 * 通用桌游子组件公共类型定义。（§2）
 */

// ─── 大厅（Lobby）─────────────────────────────────────────────────────────────

export interface LobbyPlayer {
  userQQ: string;
  displayName: string;
  joinedAt: number; // unix timestamp
}

export interface PendingVote {
  type: 'start' | 'kick';
  targetQQ?: string;
  initiatorQQ: string;
  /** QQ → approve(true) / reject(false) */
  votes: Record<string, boolean>;
  expiresAt: number; // unix timestamp
}

export interface LobbyState {
  phase: 'lobby';
  creatorQQ: string;
  players: LobbyPlayer[];
  pendingVote?: PendingVote;
}

// ─── 通用投票结果 ──────────────────────────────────────────────────────────────

export type VoteCastResult =
  | { status: 'recorded' }
  | { status: 'passed'; approvals: number; total: number }
  | { status: 'failed'; approvals: number; total: number };

// ─── IGameModule（§5.10 简化版） ──────────────────────────────────────────────

export interface GameModuleMeta {
  minPlayers: number;
  maxPlayers: number;
  requiresKP: boolean;
  description: string;
}
