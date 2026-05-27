/**
 * @module modules/soup/soup-state
 * 海龟汤游戏运行时状态类型（§4.1.2）。
 */

import type { ContributionState } from './contribution';

export type SoupPhase = 'setup' | 'running' | 'restoring';

export interface SoupRuntimeState {
  phase: SoupPhase;
  currentPuzzleId: string | null;

  setupFilters: {
    difficulty: number | null;
    tags: string[];
  };

  contribution: ContributionState;

  restoringBy: string | null;
  /** 还原超时时间戳（Unix 秒），超过后自动重置为 running */
  restoringExpiresAt: number | null;

  giveupVotes: string[];
  changeVotes: string[];
  changeInitiator: string | null;

  lastHintAt: number | null;
  givenHintIndices: number[];

  directionRequestExpiresAt: number | null;

  startedAt: number | null;

  /** QQ → 显示名称（群名片优先，否则昵称）。每次玩家交互时更新 */
  playerNames: Record<string, string>;

  /**
   * 是否处于宽限期（idle 超时提醒后的 N 分钟等待阶段）。
   * 宽限期内可 .soup continue 延续或 .soup end 立即结束。
   */
  inGracePeriod: boolean;
}

export function initialSoupState(): SoupRuntimeState {
  return {
    phase: 'setup',
    currentPuzzleId: null,
    setupFilters: { difficulty: null, tags: [] },
    contribution: {
      pools: { exploration: 40, breakthrough: 35, endgame: 25 },
      players: {},
      keyPointsTriggered: {},
      questionLog: [],
      restoreLog: [],
    },
    restoringBy: null,
    restoringExpiresAt: null,
    giveupVotes: [],
    changeVotes: [],
    changeInitiator: null,
    lastHintAt: null,
    givenHintIndices: [],
    directionRequestExpiresAt: null,
    startedAt: null,
    playerNames: {},
    inGracePeriod: false,
  };
}
