/**
 * @module game-undercover/undercover-module
 * 谁是卧底核心游戏逻辑（纯函数，无副作用）。
 * 负责：角色分配、状态转换、胜负判定。
 */

import type { LobbyPlayer } from '@dice-soup/game-common';
import { createLobbyState } from '@dice-soup/game-common';
import type { UndercoverGameState, UndercoverPlayer, EliminatedPlayer, UndercoverRole, WordPair } from './types';
import { getPlayerConfig } from './undercover-config';

// ─── 初始化 ────────────────────────────────────────────────────────────────────

export function createInitialUndercoverState(creatorQQ: string, displayName: string): UndercoverGameState {
  return {
    phase: 'lobby',
    lobby: createLobbyState(creatorQQ, displayName),
    players: [],
    wordPairId: '',
    normalWord: '',
    undercoverWord: '',
    enableBlank: true,
    round: 0,
    speechOrder: [],
    currentSpeakerIndex: 0,
    votes: {},
    pkPlayers: [],
    eliminatedPlayers: [],
    winner: null,
    winnerQQs: [],
  };
}

// ─── 角色分配 ──────────────────────────────────────────────────────────────────

/**
 * 将大厅玩家列表转换为带角色的游戏玩家列表。
 * 返回 null 表示人数不合法。
 */
export function assignRoles(
  lobbyPlayers: LobbyPlayer[],
  enableBlank: boolean,
): UndercoverPlayer[] | null {
  const config = getPlayerConfig(lobbyPlayers.length, enableBlank);
  if (!config) return null;

  // 构建角色池
  const roles: UndercoverRole[] = [
    ...Array(config.undercovers).fill('undercover' as UndercoverRole),
    ...Array(config.blanks).fill('blank' as UndercoverRole),
    ...Array(config.civilians).fill('civilian' as UndercoverRole),
  ];

  // Fisher-Yates 洗牌
  const shuffled = [...roles];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const now = Math.floor(Date.now() / 1000);
  return lobbyPlayers.map((p, i) => ({
    userQQ: p.userQQ,
    displayName: p.displayName,
    role: shuffled[i],
    alive: true,
    joinedAt: p.joinedAt ?? now,
    speakingDone: false,
    currentRoundSpeech: null,
  }));
}

// ─── 游戏开始 ──────────────────────────────────────────────────────────────────

export function startGame(
  state: UndercoverGameState,
  wordPair: WordPair,
  enableBlank: boolean,
): UndercoverGameState | null {
  const players = assignRoles(state.lobby.players, enableBlank);
  if (!players) return null;

  const speechOrder = players.map((p) => p.userQQ);
  // 随机化发言顺序
  for (let i = speechOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [speechOrder[i], speechOrder[j]] = [speechOrder[j], speechOrder[i]];
  }

  return {
    ...state,
    phase: 'speaking',
    players,
    wordPairId: wordPair.id,
    normalWord: wordPair.normalWord,
    undercoverWord: wordPair.undercoverWord,
    enableBlank,
    round: 1,
    speechOrder,
    currentSpeakerIndex: 0,
    votes: {},
    pkPlayers: [],
    eliminatedPlayers: [],
    winner: null,
    winnerQQs: [],
  };
}

// ─── 发言管理 ──────────────────────────────────────────────────────────────────

export function getCurrentSpeaker(state: UndercoverGameState): string | null {
  if (state.phase !== 'speaking' && state.phase !== 'pk_speaking') return null;
  return state.speechOrder[state.currentSpeakerIndex] ?? null;
}

/** 记录当前发言人的发言内容，并推进到下一位 */
export function recordSpeechAndAdvance(
  state: UndercoverGameState,
  speech: string,
): { state: UndercoverGameState; allDone: boolean } {
  const updatedPlayers = state.players.map((p) => {
    if (p.userQQ === state.speechOrder[state.currentSpeakerIndex]) {
      return { ...p, speakingDone: true, currentRoundSpeech: speech };
    }
    return p;
  });

  const nextIndex = state.currentSpeakerIndex + 1;
  const allDone = nextIndex >= state.speechOrder.length;

  return {
    allDone,
    state: {
      ...state,
      players: updatedPlayers,
      currentSpeakerIndex: nextIndex,
      phase: allDone ? 'voting' : state.phase,
    },
  };
}

// ─── 投票管理 ──────────────────────────────────────────────────────────────────

export function castVote(
  state: UndercoverGameState,
  voterQQ: string,
  targetQQ: string,
): { ok: true; state: UndercoverGameState } | { ok: false; reason: string } {
  const phase = state.phase;
  if (phase !== 'voting' && phase !== 'pk_voting') {
    return { ok: false, reason: '当前不在投票阶段' };
  }

  const voter = state.players.find((p) => p.userQQ === voterQQ && p.alive);
  if (!voter) return { ok: false, reason: '你不在存活玩家列表中' };

  const target = state.players.find((p) => p.userQQ === targetQQ && p.alive);
  if (!target) return { ok: false, reason: '目标玩家不存在或已出局' };

  if (phase === 'pk_voting' && !state.pkPlayers.includes(targetQQ)) {
    return { ok: false, reason: '平票加赛只能投平票玩家' };
  }

  if (voterQQ in state.votes) {
    return { ok: false, reason: '你已经投过票了' };
  }

  const newVotes = { ...state.votes, [voterQQ]: targetQQ };

  return {
    ok: true,
    state: { ...state, votes: newVotes },
  };
}

export interface ProcessVoteResult {
  type: 'eliminated' | 'pk';
  eliminated?: EliminatedPlayer;
  pkPlayers?: string[];
}

/** 统计票数，返回淘汰结果或平票情况 */
export function processVotes(state: UndercoverGameState): ProcessVoteResult {
  const tally = new Map<string, number>();

  for (const targetQQ of Object.values(state.votes)) {
    tally.set(targetQQ, (tally.get(targetQQ) ?? 0) + 1);
  }

  const maxVotes = Math.max(...tally.values());
  const topCandidates = [...tally.entries()]
    .filter(([, count]) => count === maxVotes)
    .map(([qq]) => qq);

  if (topCandidates.length > 1) {
    return { type: 'pk', pkPlayers: topCandidates };
  }

  const eliminatedQQ = topCandidates[0];
  const eliminatedPlayer = state.players.find((p) => p.userQQ === eliminatedQQ)!;

  return {
    type: 'eliminated',
    eliminated: {
      userQQ: eliminatedPlayer.userQQ,
      displayName: eliminatedPlayer.displayName,
      role: eliminatedPlayer.role,
      round: state.round,
    },
  };
}

/** 应用淘汰结果，更新状态 */
export function applyElimination(
  state: UndercoverGameState,
  eliminated: EliminatedPlayer,
): UndercoverGameState {
  const updatedPlayers = state.players.map((p) =>
    p.userQQ === eliminated.userQQ ? { ...p, alive: false } : p,
  );

  return {
    ...state,
    players: updatedPlayers,
    eliminatedPlayers: [...state.eliminatedPlayers, eliminated],
  };
}

/** 进入平票加赛阶段 */
export function enterPKPhase(
  state: UndercoverGameState,
  pkPlayers: string[],
): UndercoverGameState {
  return {
    ...state,
    phase: 'pk_speaking',
    pkPlayers,
    speechOrder: pkPlayers,
    currentSpeakerIndex: 0,
    votes: {},
  };
}

// ─── 下一轮 ────────────────────────────────────────────────────────────────────

/** 开始新一轮（重置发言状态，发言顺序从出局者下一位开始） */
export function startNextRound(
  state: UndercoverGameState,
  lastEliminatedQQ: string,
): UndercoverGameState {
  const alivePlayers = state.players.filter((p) => p.alive);
  const updatedPlayers = state.players.map((p) => ({
    ...p,
    speakingDone: false,
    currentRoundSpeech: null,
  }));

  // 从出局者的下一位开始发言
  const prevOrder = state.speechOrder;
  const lastIdx = prevOrder.indexOf(lastEliminatedQQ);
  const startQQ = prevOrder[(lastIdx + 1) % prevOrder.length] ?? alivePlayers[0]?.userQQ ?? '';
  const aliveQQs = alivePlayers.map((p) => p.userQQ);

  // 以 startQQ 为起点重排 aliveQQs
  const startIdx = aliveQQs.indexOf(startQQ);
  const newSpeechOrder = startIdx >= 0
    ? [...aliveQQs.slice(startIdx), ...aliveQQs.slice(0, startIdx)]
    : aliveQQs;

  return {
    ...state,
    phase: 'speaking',
    players: updatedPlayers,
    round: state.round + 1,
    speechOrder: newSpeechOrder,
    currentSpeakerIndex: 0,
    votes: {},
    pkPlayers: [],
  };
}

// ─── 胜负判定 ──────────────────────────────────────────────────────────────────

export interface WinResult {
  winner: 'civilian' | 'undercover' | 'blank';
  winnerQQs: string[];
}

export function checkWinCondition(state: UndercoverGameState): WinResult | null {
  const alivePlayers = state.players.filter((p) => p.alive);
  const config = getPlayerConfig(state.players.length, state.enableBlank);
  if (!config) return null;

  const aliveUndercovers = alivePlayers.filter((p) => p.role === 'undercover');
  const aliveBlanks = alivePlayers.filter((p) => p.role === 'blank');
  const aliveCivilians = alivePlayers.filter((p) => p.role === 'civilian');

  // 所有卧底出局 → 检查白板是否仍存活
  if (aliveUndercovers.length === 0) {
    if (aliveBlanks.length > 0) {
      // 白板特殊胜利：所有卧底出局但白板存活
      return {
        winner: 'blank',
        winnerQQs: aliveBlanks.map((p) => p.userQQ),
      };
    }
    // 平民胜利
    return {
      winner: 'civilian',
      winnerQQs: aliveCivilians.map((p) => p.userQQ),
    };
  }

  // 卧底胜利条件：剩余玩家数 ≤ undercoverWinAtRemaining 且至少一个卧底存活
  if (alivePlayers.length <= config.undercoverWinAtRemaining && aliveUndercovers.length > 0) {
    return {
      winner: 'undercover',
      winnerQQs: aliveUndercovers.map((p) => p.userQQ),
    };
  }

  return null;
}

// ─── 工具 ──────────────────────────────────────────────────────────────────────

export function getAlivePlayerCount(state: UndercoverGameState): number {
  return state.players.filter((p) => p.alive).length;
}

export function getPlayerRole(state: UndercoverGameState, userQQ: string): UndercoverRole | null {
  return state.players.find((p) => p.userQQ === userQQ)?.role ?? null;
}

export function isPlayerAlive(state: UndercoverGameState, userQQ: string): boolean {
  return state.players.find((p) => p.userQQ === userQQ)?.alive ?? false;
}

export function hasAllVoted(state: UndercoverGameState): boolean {
  const phase = state.phase;
  if (phase !== 'voting' && phase !== 'pk_voting') return false;

  const eligible = state.players.filter((p) => p.alive).map((p) => p.userQQ);
  return eligible.every((qq) => qq in state.votes);
}
