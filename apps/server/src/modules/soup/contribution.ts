/**
 * @module modules/soup/contribution
 * 贡献度算法（K19 完整实现）。
 * 三池：探索池 40 / 突破池 35 / 终局池 25，总和守恒于 100。
 */

import type { KeyPoint } from '../../services/soup-service';

// ── 运行时状态类型 ─────────────────────────────────────────────────────────────

export interface PlayerState {
  joinedAt: number;
  questionsTotal: number;
  yesCountSinceLastBreakthrough: number;
  breakthroughs: string[];
  hintRequests: number;
  score: number;
}

export interface QuestionLogEntry {
  qq: string;
  questionIndex: number;
  question: string;
  verdict: 'yes' | 'no' | 'irrelevant' | 'partial';
  matchedKeyPoints: string[];
  at: number;
}

export interface RestoreLogEntry {
  qq: string;
  text: string;
  passed: boolean;
  coverage: number;
  missingCriticalIds: string[];
  at: number;
}

export interface ContributionState {
  pools: { exploration: number; breakthrough: number; endgame: number };
  players: Record<string, PlayerState>;
  keyPointsTriggered: Record<string, { triggeredByQq: string; atQuestionIndex: number }>;
  questionLog: QuestionLogEntry[];
  restoreLog: RestoreLogEntry[];
}

// ── 初始化 ────────────────────────────────────────────────────────────────────

export function initContributionState(players: string[]): ContributionState {
  const now = Math.floor(Date.now() / 1000);
  const state: ContributionState = {
    pools: { exploration: 40, breakthrough: 35, endgame: 25 },
    players: {},
    keyPointsTriggered: {},
    questionLog: [],
    restoreLog: [],
  };

  for (const qq of players) {
    state.players[qq] = {
      joinedAt: now,
      questionsTotal: 0,
      yesCountSinceLastBreakthrough: 0,
      breakthroughs: [],
      hintRequests: 0,
      score: 0,
    };
  }

  return state;
}

export function addPlayer(state: ContributionState, qq: string): void {
  if (!state.players[qq]) {
    state.players[qq] = {
      joinedAt: Math.floor(Date.now() / 1000),
      questionsTotal: 0,
      yesCountSinceLastBreakthrough: 0,
      breakthroughs: [],
      hintRequests: 0,
      score: 0,
    };
  }
}

// ── 系数计算 ──────────────────────────────────────────────────────────────────

/** 个人疲劳系数 P_i（K19） */
function personalFatigue(questionsTotal: number): number {
  if (questionsTotal <= 10) return 1.0;
  return Math.max(1.0 - 0.02 * (questionsTotal - 10), 0.0);
}

/** 全局衰减系数 D_global（K19） */
function globalDecay(totalQuestions: number): number {
  if (totalQuestions <= 20) return 1.0;
  return Math.max(1.0 - 0.01 * (totalQuestions - 20), 0.0);
}

/** 全场累计提问数 */
function totalQuestions(state: ContributionState): number {
  return state.questionLog.length;
}

// ── 核心更新函数 ──────────────────────────────────────────────────────────────

/**
 * 处理一次提问的贡献度更新。
 * 返回是否触发了关键突破。
 */
export function applyAsk(
  state: ContributionState,
  qq: string,
  verdict: 'yes' | 'no' | 'irrelevant' | 'partial',
  matchedKeyPoints: string[],
  keyPoints: KeyPoint[],
  question: string,
): { breakthroughIds: string[] } {
  const player = state.players[qq];
  if (!player) return { breakthroughIds: [] };

  const questionIndex = state.questionLog.length;
  const Pi = personalFatigue(player.questionsTotal);
  const Dg = globalDecay(totalQuestions(state));
  const breakthroughIds: string[] = [];

  player.questionsTotal += 1;

  // 检查关键突破
  const newKeyPoints = matchedKeyPoints.filter((kpId) => !state.keyPointsTriggered[kpId]);
  for (const kpId of newKeyPoints) {
    const N = keyPoints.length || 1;
    const basePerKp = 35 / N;
    const k = player.breakthroughs.length + 1;
    const baseScore = basePerKp * Dg;
    const multiplier = 1 + 0.1 * (k - 1); // K19.5
    const totalScore = baseScore * multiplier;
    const overflow = totalScore - baseScore;

    // 主分从突破池扣
    state.pools.breakthrough = Math.max(0, state.pools.breakthrough - baseScore);

    // 溢出从探索池扣（K19.10）
    if (state.pools.exploration >= overflow) {
      state.pools.exploration -= overflow;
      player.score += totalScore;
    } else {
      const actualOverflow = state.pools.exploration;
      state.pools.exploration = 0;
      player.score += baseScore + actualOverflow;
    }

    state.keyPointsTriggered[kpId] = { triggeredByQq: qq, atQuestionIndex: questionIndex };
    player.breakthroughs.push(kpId);
    breakthroughIds.push(kpId);

    // 全员 yes_count 重置
    for (const p of Object.values(state.players)) {
      p.yesCountSinceLastBreakthrough = 0;
    }
  }

  // 有效探索（无新突破时）
  if (breakthroughIds.length === 0 && (verdict === 'yes' || verdict === 'partial')) {
    if (player.yesCountSinceLastBreakthrough < 3) {
      const gain = Pi * 1.0;
      player.score += gain;
      state.pools.exploration = Math.max(0, state.pools.exploration - gain);
      player.yesCountSinceLastBreakthrough += 1;
    }
  }

  // 无效探索
  if (verdict === 'no' || verdict === 'irrelevant') {
    player.score -= 1.0;
    state.pools.exploration += 1.0;
  }

  // 记入日志
  state.questionLog.push({
    qq,
    questionIndex,
    question,
    verdict,
    matchedKeyPoints,
    at: Math.floor(Date.now() / 1000),
  });

  return { breakthroughIds };
}

/**
 * 处理还原成功的终局奖励（K19 §4.6.6）。
 */
export function applyRestore(
  state: ContributionState,
  solverQq: string,
  coverage: number,
  lookbackCount: number,
): void {
  const solver = state.players[solverQq];
  if (!solver) return;

  const noBreakthroughPenalty = solver.breakthroughs.length === 0 ? 0.5 : 1.0;
  const totalPrize = coverage * 25 * noBreakthroughPenalty;
  state.pools.endgame = Math.max(0, state.pools.endgame - totalPrize);

  // 找助攻：终局前 lookbackCount 条 yes 的非还原者
  const recentLog = state.questionLog.slice(-lookbackCount);
  const assistYesCounts: Record<string, number> = {};
  for (const entry of recentLog) {
    if (entry.verdict === 'yes' && entry.qq !== solverQq) {
      assistYesCounts[entry.qq] = (assistYesCounts[entry.qq] ?? 0) + 1;
    }
  }

  if (Object.keys(assistYesCounts).length === 0) {
    // 无助攻，还原者独占
    solver.score += totalPrize;
  } else {
    // 60% 还原者 / 40% 助攻按 yes 比例
    solver.score += totalPrize * 0.6;
    const assistPool = totalPrize * 0.4;
    const totalYes = Object.values(assistYesCounts).reduce((a, b) => a + b, 0);
    for (const [qq, count] of Object.entries(assistYesCounts)) {
      if (state.players[qq]) {
        state.players[qq].score += assistPool * (count / totalYes);
      }
    }
  }
}

/**
 * 记录一次还原尝试（无论成败），供事后复盘。
 */
export function recordRestoreAttempt(
  state: ContributionState,
  qq: string,
  text: string,
  passed: boolean,
  coverage: number,
  missingCriticalIds: string[],
): void {
  if (!state.restoreLog) state.restoreLog = [];
  state.restoreLog.push({
    qq,
    text,
    passed,
    coverage,
    missingCriticalIds,
    at: Math.floor(Date.now() / 1000),
  });
}

/**
 * hint 请求：扣请求者 0.2 分，回流探索池（K11.2 / K19.7）。
 */
export function applyHint(state: ContributionState, requesterQq: string): void {
  const player = state.players[requesterQq];
  if (!player) return;

  player.score -= 0.2;
  state.pools.exploration += 0.2;
  player.hintRequests += 1;
}

// ── 不变式校验（K19 + §8.2） ──────────────────────────────────────────────────

export function assertInvariant(state: ContributionState): void {
  const playerSum = Object.values(state.players).reduce((s, p) => s + p.score, 0);
  const poolSum = state.pools.exploration + state.pools.breakthrough + state.pools.endgame;
  const total = playerSum + poolSum;

  if (Math.abs(total - 100) > 0.05) {
    throw new Error(
      `CONTRIBUTION_INVARIANT_VIOLATED: total=${total.toFixed(4)} (expected ≈ 100)`,
    );
  }

  if (state.pools.exploration < -0.01) throw new Error('CONTRIBUTION_INVARIANT_VIOLATED: exploration pool negative');
  if (state.pools.breakthrough < -0.01) throw new Error('CONTRIBUTION_INVARIANT_VIOLATED: breakthrough pool negative');
  if (state.pools.endgame < -0.01) throw new Error('CONTRIBUTION_INVARIANT_VIOLATED: endgame pool negative');
}

// ── 结算辅助 ──────────────────────────────────────────────────────────────────

export interface FinalScore {
  qq: string;
  score: number;
  rank: number;
  breakthroughCount: number;
  questionsAsked: number;
}

export function calcFinalScores(state: ContributionState): FinalScore[] {
  const entries = Object.entries(state.players).map(([qq, p]) => ({
    qq,
    score: p.score,
    breakthroughCount: p.breakthroughs.length,
    questionsAsked: p.questionsTotal,
    rank: 0,
  }));

  entries.sort((a, b) => b.score - a.score);
  entries.forEach((e, i) => { e.rank = i + 1; });
  return entries;
}
