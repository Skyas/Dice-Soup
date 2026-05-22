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

  giveupVotes: string[];
  changeVotes: string[];
  changeInitiator: string | null;

  lastHintAt: number | null;
  givenHintIndices: number[];

  directionRequestExpiresAt: number | null;

  startedAt: number | null;
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
    },
    restoringBy: null,
    giveupVotes: [],
    changeVotes: [],
    changeInitiator: null,
    lastHintAt: null,
    givenHintIndices: [],
    directionRequestExpiresAt: null,
    startedAt: null,
  };
}
