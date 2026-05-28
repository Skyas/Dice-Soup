/**
 * @module game-undercover/types
 * 谁是卧底游戏专属类型定义。
 */

import type { LobbyState } from '@dice-soup/game-common';

// ─── 角色 & 阶段 ──────────────────────────────────────────────────────────────

export type UndercoverRole = 'civilian' | 'undercover' | 'blank';

export type UndercoverPhase =
  | 'lobby'        // 准备阶段（等待加入、开始投票）
  | 'speaking'     // 发言阶段（逐一点名）
  | 'voting'       // 投票阶段（选出最可疑的人）
  | 'pk_speaking'  // 平票加赛发言
  | 'pk_voting'    // 平票加赛投票
  | 'reveal'       // 公布出局者身份（短暂过渡态）
  | 'ended';       // 游戏结束

// ─── 玩家状态 ─────────────────────────────────────────────────────────────────

export interface UndercoverPlayer {
  userQQ: string;
  displayName: string;
  role: UndercoverRole;
  alive: boolean;
  joinedAt: number;
  /** 本轮是否已发言 */
  speakingDone: boolean;
  /** 本轮发言内容（文字房记录） */
  currentRoundSpeech: string | null;
}

export interface EliminatedPlayer {
  userQQ: string;
  displayName: string;
  role: UndercoverRole;
  round: number;
}

// ─── 游戏状态 ─────────────────────────────────────────────────────────────────

export interface UndercoverGameState {
  phase: UndercoverPhase;

  /** 大厅状态（仅 lobby 阶段有效） */
  lobby: LobbyState;

  /** 游戏中所有玩家（含已淘汰），在游戏开始时从 lobby.players 复制并附加 role */
  players: UndercoverPlayer[];

  /** 词对 ID */
  wordPairId: string;
  /** 平民词（仅内部使用，不应泄露给非平民） */
  normalWord: string;
  /** 卧底词（仅内部使用） */
  undercoverWord: string;

  /** 是否启用白板 */
  enableBlank: boolean;

  /** 当前轮次 */
  round: number;

  /** 本轮发言顺序（存活玩家 QQ 列表） */
  speechOrder: string[];
  /** 当前发言人在 speechOrder 中的索引 */
  currentSpeakerIndex: number;

  /** 本轮投票记录：投票人 QQ → 被投票人 QQ */
  votes: Record<string, string>;

  /** 平票加赛的参与者 QQ 列表 */
  pkPlayers: string[];

  /** 已淘汰玩家记录 */
  eliminatedPlayers: EliminatedPlayer[];

  /** 胜利阵营 */
  winner: 'civilian' | 'undercover' | 'blank' | null;
  /** 胜利玩家 QQ 列表 */
  winnerQQs: string[];
}

// ─── 词对（来自 DB，由服务层传入） ───────────────────────────────────────────

export interface WordPair {
  id: string;
  normalWord: string;
  undercoverWord: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}
