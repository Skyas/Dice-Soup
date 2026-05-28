/**
 * @module game-common/lobby
 * 通用游戏大厅逻辑（准备阶段：加入、退出、踢人、开始投票）。
 * 纯函数，无副作用，无外部依赖。
 */

import type { LobbyState, LobbyPlayer, PendingVote, VoteCastResult } from './types';
import { GameCommonErrorCodes } from './errors';

// ─── 创建大厅 ──────────────────────────────────────────────────────────────────

export function createLobbyState(
  creatorQQ: string,
  displayName: string,
): LobbyState {
  const now = Math.floor(Date.now() / 1000);
  return {
    phase: 'lobby',
    creatorQQ,
    players: [{ userQQ: creatorQQ, displayName, joinedAt: now }],
  };
}

// ─── 玩家管理 ──────────────────────────────────────────────────────────────────

export function addPlayerToLobby(
  state: LobbyState,
  userQQ: string,
  displayName: string,
  maxPlayers: number,
): { ok: true; state: LobbyState } | { ok: false; code: string; message: string } {
  if (state.players.some((p) => p.userQQ === userQQ)) {
    return { ok: false, code: GameCommonErrorCodes.PLAYER_ALREADY_JOINED, message: '你已在房间中' };
  }
  if (state.players.length >= maxPlayers) {
    return { ok: false, code: GameCommonErrorCodes.TOO_MANY_PLAYERS, message: `房间已满（最多 ${maxPlayers} 人）` };
  }
  const now = Math.floor(Date.now() / 1000);
  return {
    ok: true,
    state: {
      ...state,
      players: [...state.players, { userQQ, displayName, joinedAt: now }],
    },
  };
}

export function removePlayerFromLobby(
  state: LobbyState,
  userQQ: string,
): { ok: true; state: LobbyState } | { ok: false; code: string; message: string } {
  if (!state.players.some((p) => p.userQQ === userQQ)) {
    return { ok: false, code: GameCommonErrorCodes.PLAYER_NOT_IN_LOBBY, message: '你不在房间中' };
  }
  return {
    ok: true,
    state: {
      ...state,
      players: state.players.filter((p) => p.userQQ !== userQQ),
      // 取消进行中的投票（若有）
      pendingVote: undefined,
    },
  };
}

// ─── 投票 ──────────────────────────────────────────────────────────────────────

/**
 * 发起一个新投票（开始游戏或踢人）。
 * timeoutSeconds：投票超时时间。
 */
export function initiateVote(
  state: LobbyState,
  vote: Omit<PendingVote, 'votes' | 'expiresAt'>,
  timeoutSeconds: number,
): { ok: true; state: LobbyState } | { ok: false; code: string; message: string } {
  if (state.pendingVote) {
    const now = Math.floor(Date.now() / 1000);
    if (now < state.pendingVote.expiresAt) {
      return { ok: false, code: GameCommonErrorCodes.VOTE_ALREADY_ACTIVE, message: '已有进行中的投票' };
    }
  }

  if (vote.type === 'kick') {
    if (!vote.targetQQ) return { ok: false, code: 'INVALID_ARGS', message: '踢人投票需要指定目标' };
    if (vote.targetQQ === state.creatorQQ) {
      return { ok: false, code: GameCommonErrorCodes.CANNOT_KICK_CREATOR, message: '不能踢出房主' };
    }
    if (vote.targetQQ === vote.initiatorQQ) {
      return { ok: false, code: GameCommonErrorCodes.CANNOT_KICK_SELF, message: '不能踢自己' };
    }
    if (!state.players.some((p) => p.userQQ === vote.targetQQ)) {
      return { ok: false, code: GameCommonErrorCodes.PLAYER_NOT_IN_LOBBY, message: '目标玩家不在房间中' };
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const pendingVote: PendingVote = {
    ...vote,
    votes: { [vote.initiatorQQ]: true }, // 发起人默认投赞成
    expiresAt: now + timeoutSeconds,
  };

  return { ok: true, state: { ...state, pendingVote } };
}

/**
 * 提交一票。
 * passCondition: 'unanimous' = 全员同意；'majority' = 超半数同意
 */
export function castLobbyVote(
  state: LobbyState,
  voterQQ: string,
  approve: boolean,
  passCondition: 'unanimous' | 'majority' = 'unanimous',
): { ok: true; result: VoteCastResult; state: LobbyState } | { ok: false; code: string; message: string } {
  if (!state.pendingVote) {
    return { ok: false, code: GameCommonErrorCodes.VOTE_NOT_ACTIVE, message: '当前没有进行中的投票' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > state.pendingVote.expiresAt) {
    return { ok: false, code: GameCommonErrorCodes.VOTE_EXPIRED, message: '投票已超时' };
  }

  if (!state.players.some((p) => p.userQQ === voterQQ)) {
    return { ok: false, code: GameCommonErrorCodes.PLAYER_NOT_IN_LOBBY, message: '你不在房间中' };
  }

  if (voterQQ in state.pendingVote.votes) {
    return { ok: false, code: GameCommonErrorCodes.ALREADY_VOTED, message: '你已经投过票了' };
  }

  const newVotes = { ...state.pendingVote.votes, [voterQQ]: approve };
  const updatedVote: PendingVote = { ...state.pendingVote, votes: newVotes };
  const total = state.players.length;
  const approvals = Object.values(newVotes).filter(Boolean).length;
  const rejections = Object.values(newVotes).filter((v) => !v).length;

  let result: VoteCastResult;

  if (passCondition === 'unanimous') {
    if (approvals === total) {
      result = { status: 'passed', approvals, total };
    } else if (rejections > 0) {
      result = { status: 'failed', approvals, total };
    } else {
      result = { status: 'recorded' };
    }
  } else {
    // majority
    const majority = Math.ceil(total / 2);
    if (approvals >= majority) {
      result = { status: 'passed', approvals, total };
    } else if (rejections > total - majority) {
      result = { status: 'failed', approvals, total };
    } else {
      result = { status: 'recorded' };
    }
  }

  const newState: LobbyState = {
    ...state,
    pendingVote: result.status === 'recorded' ? updatedVote : undefined,
  };

  return { ok: true, result, state: newState };
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

export function getLobbyPlayer(state: LobbyState, userQQ: string): LobbyPlayer | undefined {
  return state.players.find((p) => p.userQQ === userQQ);
}

export function isVoteExpired(vote: PendingVote): boolean {
  return Math.floor(Date.now() / 1000) > vote.expiresAt;
}
