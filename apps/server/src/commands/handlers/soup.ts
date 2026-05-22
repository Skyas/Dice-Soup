/**
 * @module commands/handlers/soup
 * 海龟汤游戏指令处理器。
 * 子命令：start | join | go | ask | hint | restore | giveup | change | submit | direction
 */

import { createLogger } from '@dice-soup/logger';
import type { LLMRouter } from '@dice-soup/llm-router';
import type { CommandContext, CommandHandler, CommandMeta } from '../types';
import type { SessionManager } from '../../services/session-manager';
import type { SoupService } from '../../services/soup-service';
import type { SoupPuzzleData } from '../../services/soup-service';
import type { SoupRuntimeState } from '../../modules/soup/soup-state';
import { initialSoupState } from '../../modules/soup/soup-state';
import {
  initContributionState,
  addPlayer,
  applyAsk,
  applyRestore,
  applyHint,
  calcFinalScores,
  assertInvariant,
} from '../../modules/soup/contribution';
import { callSoupJudge, callSoupRestore, callSummary } from '../../modules/soup/soup-llm';

const log = createLogger({ module: 'cmd:soup' });

const VERDICT_DISPLAY: Record<string, string> = {
  yes: '✅ 是',
  no: '❌ 否',
  irrelevant: '🔄 与本题无关',
  partial: '〜 部分正确',
};

export class SoupHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'soup',
    aliases: [],
    action: 'write',
    scope: 'session',
    channel: 'both',
    requiredRole: 'guest',
    nlAllowed: false,
    description: '海龟汤游戏（.soup start 开始，.soup help 查看帮助）',
  };

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly soupService: SoupService,
    private readonly llmRouter: LLMRouter,
  ) {}

  async execute(ctx: CommandContext): Promise<void> {
    const sub = ctx.args[0]?.toLowerCase() ?? '';
    const subRawArgs = ctx.rawArgs.slice(sub.length).trim();

    switch (sub) {
      case 'start': return this.handleStart(ctx);
      case 'join': return this.handleJoin(ctx);
      case 'go': return this.handleGo(ctx);
      case 'ask': return this.handleAsk(ctx, subRawArgs);
      case 'hint': return this.handleHint(ctx);
      case 'restore': return this.handleRestore(ctx, subRawArgs);
      case 'giveup': return this.handleGiveup(ctx);
      case 'change': return this.handleChange(ctx);
      case 'difficulty': return this.handleDifficulty(ctx, subRawArgs);
      case 'tags': return this.handleTags(ctx, subRawArgs);
      case 'direction': return this.handleDirection(ctx);
      case 'submit': return this.handleSubmit(ctx, subRawArgs);
      case 'help':
      case '':
        return ctx.reply(this.buildHelpText(ctx.configService.getCommandPrefix()));
      default:
        return ctx.reply(
          `❓ 未知子命令 "soup ${sub}"，输入 ${ctx.configService.getCommandPrefix()}soup help 查看帮助`,
        );
    }
  }

  // ── start ─────────────────────────────────────────────────────────────────

  private async handleStart(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) {
      return ctx.reply('⚠️ 海龟汤只能在群里开局');
    }

    const ensured = await ctx.userService.ensureUserExists(ctx.senderQQ, ctx.senderName);
    if (!ensured.ok) {
      return ctx.reply('注册用户失败，请稍后重试');
    }

    const initialState = initialSoupState();
    initialState.contribution = initContributionState([ctx.senderQQ]);
    initialState.contribution.players[ctx.senderQQ].joinedAt = Math.floor(Date.now() / 1000);

    const result = await this.sessionManager.createSession(
      ctx.groupId,
      'qq',
      ctx.senderQQ,
      initialState as unknown as Record<string, unknown>,
    );

    if (!result.ok) {
      return ctx.reply(`⚠️ ${result.reason}`);
    }

    const sessionId = result.sessionId;
    log.info({ sessionId, senderQQ: ctx.senderQQ }, '[soup] 会话创建');

    // 注册 setup 超时（3 分钟）
    const setupTimeoutMs = (ctx.configService.get<number>('soup.setup_idle_minutes') ?? 3) * 60_000;
    this.sessionManager.registerActivityTimeout(sessionId, setupTimeoutMs, async () => {
      await this.onSetupTimeout(sessionId, ctx.groupId!, ctx);
    });

    await ctx.reply(
      `🐢 海龟汤！${ctx.senderName} 发起了一局游戏！\n` +
      `可选操作：\n` +
      `  • .soup difficulty <1-5>  设置难度\n` +
      `  • .soup tags <标签>       设置标签偏好\n` +
      `  • .soup join              其他人加入\n` +
      `  • .soup go                确认出题，开始游戏！\n` +
      `（3分钟内无操作将自动取消）`,
    );
  }

  // ── join ──────────────────────────────────────────────────────────────────

  private async handleJoin(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) {
      return ctx.reply('⚠️ 请在群里使用此命令');
    }

    await ctx.userService.ensureUserExists(ctx.senderQQ, ctx.senderName);

    const roomId = await this.sessionManager.getRoomIdByGroupId(ctx.groupId, 'qq');
    if (!roomId) return ctx.reply('⚠️ 当前群没有进行中的游戏');

    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session) return ctx.reply('⚠️ 当前群没有进行中的游戏');

    // 加入检查
    const joinResult = await this.sessionManager.joinSession(session.id, ctx.senderQQ);
    if (!joinResult.ok) {
      return ctx.reply(`⚠️ ${joinResult.reason}`);
    }

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;
    addPlayer(snapshot.contribution, ctx.senderQQ);
    this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);

    await ctx.reply(`👋 ${ctx.senderName} 加入游戏！当前 ${session.members.length + 1} 人`);

    // 如果 running 状态，私聊推送当前汤面 + 提问历史（K1.1）
    if (snapshot.phase === 'running' && snapshot.currentPuzzleId) {
      const puzzleResult = await this.soupService.getPuzzleById(snapshot.currentPuzzleId);
      if (puzzleResult.ok) {
        const puzzle = puzzleResult.value;
        const historyLines = snapshot.contribution.questionLog
          .slice(-20)
          .map((q) => {
            const v = VERDICT_DISPLAY[q.verdict] ?? q.verdict;
            return `Q${q.questionIndex + 1}: [${q.qq}] ${v}`;
          })
          .join('\n');

        await ctx.replyPrivate(
          `🐢 《${puzzle.title}》\n\n` +
          `【汤面】\n${puzzle.surface}\n\n` +
          `【近期提问记录】\n${historyLines || '（暂无）'}`,
        );
      }
    }
  }

  // ── difficulty ────────────────────────────────────────────────────────────

  private async handleDifficulty(ctx: CommandContext, args: string): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    const roomId = await this.sessionManager.getRoomIdByGroupId(ctx.groupId, 'qq');
    if (!roomId) return ctx.reply('⚠️ 当前群没有进行中的游戏');

    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session || session.state !== 'setup') {
      return ctx.reply('⚠️ 只能在选题阶段设置难度');
    }
    if (session.createdBy !== ctx.senderQQ) {
      return ctx.reply('⚠️ 只有发起人可以设置条件');
    }

    const n = parseInt(args.trim(), 10);
    if (isNaN(n) || n < 1 || n > 5) {
      return ctx.reply('⚠️ 难度请输入 1-5 的整数');
    }

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;
    snapshot.setupFilters.difficulty = n;
    this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);

    const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
    await ctx.reply(`✅ 难度设置为 ${stars}（${n}）`);
  }

  // ── tags ──────────────────────────────────────────────────────────────────

  private async handleTags(ctx: CommandContext, args: string): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    const roomId = await this.sessionManager.getRoomIdByGroupId(ctx.groupId, 'qq');
    if (!roomId) return ctx.reply('⚠️ 当前群没有进行中的游戏');

    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session || session.state !== 'setup') {
      return ctx.reply('⚠️ 只能在选题阶段设置标签');
    }
    if (session.createdBy !== ctx.senderQQ) {
      return ctx.reply('⚠️ 只有发起人可以设置条件');
    }

    const tags = args.trim().split(/\s+/).filter(Boolean);
    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;
    snapshot.setupFilters.tags = tags;
    this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);

    await ctx.reply(`✅ 标签设置为：${tags.join(' ')}`);
  }

  // ── go ────────────────────────────────────────────────────────────────────

  private async handleGo(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    const roomId = await this.sessionManager.getRoomIdByGroupId(ctx.groupId, 'qq');
    if (!roomId) return ctx.reply('⚠️ 当前群没有进行中的游戏');

    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session || session.state !== 'setup') {
      return ctx.reply('⚠️ 只能在选题阶段使用此命令');
    }
    if (session.createdBy !== ctx.senderQQ) {
      return ctx.reply('⚠️ 只有发起人可以开始游戏');
    }

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;

    // 获取所有玩家已玩过的题目
    const excludeIds = new Set<string>();
    for (const qq of session.members) {
      const played = await this.soupService.getPlayedPuzzleIds(qq);
      played.forEach((id) => excludeIds.add(id));
    }

    // 选题
    await ctx.reply('🔍 正在选题...');
    const selectResult = await this.soupService.selectPuzzle({
      difficulty: snapshot.setupFilters.difficulty ?? undefined,
      tags: snapshot.setupFilters.tags,
      excludePuzzleIds: Array.from(excludeIds),
    });

    if (!selectResult.ok) {
      await ctx.reply(`⚠️ ${selectResult.error.message}`);
      await this.sessionManager.transitionState(session.id, 'aborted', snapshot as unknown as Record<string, unknown>, {
        endedAt: Math.floor(Date.now() / 1000),
        endReason: 'no_puzzle',
      });
      return;
    }

    const puzzle = selectResult.value;
    const now = Math.floor(Date.now() / 1000);

    // 更新快照
    snapshot.phase = 'running';
    snapshot.currentPuzzleId = puzzle.id;
    snapshot.startedAt = now;
    snapshot.contribution = initContributionState(session.members);
    snapshot.giveupVotes = [];
    snapshot.changeVotes = [];
    snapshot.givenHintIndices = [];

    this.sessionManager.clearActivityTimeout(session.id);

    await this.sessionManager.transitionState(
      session.id,
      'running',
      snapshot as unknown as Record<string, unknown>,
      { startedAt: now },
    );

    await this.soupService.incrementPlayCount(puzzle.id);

    // 注册活动超时（30 分钟）
    const idleMs = (ctx.configService.get<number>('soup.idle_timeout_minutes') ?? 30) * 60_000;
    this.sessionManager.registerActivityTimeout(session.id, idleMs, async () => {
      await this.onIdleTimeout(session.id, ctx.groupId!, puzzle, snapshot, ctx);
    });

    const diffStars = '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty);

    await ctx.reply(
      `🐢 【${puzzle.title}】\n` +
      `难度：${diffStars}\n` +
      `${puzzle.tags.length > 0 ? `标签：${puzzle.tags.join(' ')}\n` : ''}` +
      `\n【汤面】\n${puzzle.surface}\n\n` +
      `游戏开始！用 .soup ask <问题> 提问，用 .soup restore <答案> 还原真相。`,
    );
  }

  // ── ask ───────────────────────────────────────────────────────────────────

  private async handleAsk(ctx: CommandContext, question: string): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');
    if (!question.trim()) return ctx.reply('⚠️ 请输入问题，例如：.soup ask 凶手认识被害者吗？');

    const session = await this.getRunningSession(ctx);
    if (!session) return;

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;

    if (snapshot.phase === 'restoring') {
      return ctx.reply('⏳ 还原进行中，请暂停提问');
    }
    if (snapshot.phase !== 'running') {
      return ctx.reply('⚠️ 游戏尚未开始');
    }

    if (!session.members.includes(ctx.senderQQ)) {
      return ctx.reply('⚠️ 请先加入游戏：.soup join');
    }

    const player = snapshot.contribution.players[ctx.senderQQ];
    const maxAsks = ctx.configService.get<number>('soup.max_asks_per_session') ?? 100;
    if (player && player.questionsTotal >= maxAsks) {
      return ctx.reply(`⚠️ 你本场提问已达上限（${maxAsks}次）`);
    }

    const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
    if (!puzzle) return ctx.reply('⚠️ 题目加载失败，请联系管理员');

    const leakThreshold = ctx.configService.get<number>('soup.leak_keyword_threshold') ?? 2;

    await ctx.reply('🤔 判定中...');

    const judgeResult = await callSoupJudge(
      this.llmRouter,
      puzzle,
      ctx.senderQQ,
      question,
      leakThreshold,
    );

    if (!judgeResult.ok) {
      return ctx.reply('💥 判定失败，请稍后重试');
    }

    const { verdict, confidence, matched_key_points } = judgeResult.value;

    // 更新贡献度
    const { breakthroughIds } = applyAsk(
      snapshot.contribution,
      ctx.senderQQ,
      verdict,
      matched_key_points,
      puzzle.keyPoints,
    );

    try {
      assertInvariant(snapshot.contribution);
    } catch (e: any) {
      log.error({ err: e, sessionId: session.id }, '[soup] 贡献度不变式违反');
      await ctx.auditService.log({
        category: 'admin_op',
        actor: 'system',
        actorType: 'system',
        action: 'contribution_invariant_violated',
        target: session.id,
        severity: 'warning',
        meta: { error: e.message },
      });
    }

    this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);

    // 重置活动计时器
    const idleMs = (ctx.configService.get<number>('soup.idle_timeout_minutes') ?? 30) * 60_000;
    this.sessionManager.resetActivityTimer(session.id, idleMs, async () => {
      await this.onIdleTimeout(session.id, ctx.groupId!, puzzle, snapshot, ctx);
    });

    // 构建回复
    let replyText = `${VERDICT_DISPLAY[verdict] ?? verdict}`;

    if (confidence < 0.5) {
      replyText += `（不确定，可换种问法）`;
    }

    const qNum = (snapshot.contribution.players[ctx.senderQQ]?.questionsTotal ?? 0);
    replyText += `  [Q${qNum} · ${ctx.senderName}]`;

    if (breakthroughIds.length > 0) {
      replyText += `\n✨ 关键突破！（${breakthroughIds.length}个线索）`;
    }

    await ctx.reply(replyText);
  }

  // ── hint ──────────────────────────────────────────────────────────────────

  private async handleHint(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    const session = await this.getRunningSession(ctx);
    if (!session) return;

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;
    if (snapshot.phase !== 'running') return ctx.reply('⚠️ 游戏尚未开始');

    const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
    if (!puzzle) return ctx.reply('⚠️ 题目加载失败');

    if (!puzzle.hints || puzzle.hints.length === 0) {
      return ctx.reply('📭 本题暂无提示');
    }

    // 全队 5 分钟限制（K11.4）
    const hintIntervalMs = (ctx.configService.get<number>('soup.hint_team_interval_minutes') ?? 5) * 60_000;
    const now = Date.now();
    if (snapshot.lastHintAt && now - snapshot.lastHintAt * 1000 < hintIntervalMs) {
      const remainSec = Math.ceil((snapshot.lastHintAt * 1000 + hintIntervalMs - now) / 1000);
      return ctx.reply(`⏱ 距上次提示不足5分钟，请等待 ${remainSec} 秒`);
    }

    // 计算 hint 索引（K11.1：按突破数进度）
    const totalBreakthroughs = Object.values(snapshot.contribution.keyPointsTriggered).length;
    const hintIndex = Math.min(totalBreakthroughs, puzzle.hints.length - 1);

    // 检查是否已给过（递进逻辑）
    let selectedIndex = hintIndex;
    while (snapshot.givenHintIndices.includes(selectedIndex) && selectedIndex < puzzle.hints.length - 1) {
      selectedIndex++;
    }
    if (snapshot.givenHintIndices.includes(selectedIndex)) {
      return ctx.reply('📭 已无更多提示');
    }

    // 扣分（K11.2）
    applyHint(snapshot.contribution, ctx.senderQQ);
    snapshot.lastHintAt = Math.floor(now / 1000);
    snapshot.givenHintIndices.push(selectedIndex);

    this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);

    await ctx.reply(`💡 【提示 ${selectedIndex + 1}】\n${puzzle.hints[selectedIndex]}`);
  }

  // ── restore ───────────────────────────────────────────────────────────────

  private async handleRestore(ctx: CommandContext, restoreText: string): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');
    if (!restoreText.trim()) return ctx.reply('⚠️ 请输入还原内容，例如：.soup restore 真相是...');

    const session = await this.getRunningSession(ctx);
    if (!session) return;

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;
    if (snapshot.phase !== 'running') return ctx.reply('⚠️ 游戏不在提问阶段');
    if (!session.members.includes(ctx.senderQQ)) return ctx.reply('⚠️ 请先加入游戏：.soup join');

    // 设置 restoring 锁
    snapshot.phase = 'restoring';
    snapshot.restoringBy = ctx.senderQQ;
    await this.sessionManager.transitionState(
      session.id,
      'restoring',
      snapshot as unknown as Record<string, unknown>,
    );

    await ctx.reply(`🔍 ${ctx.senderName} 开始还原，请暂停提问...`);

    const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
    if (!puzzle) {
      snapshot.phase = 'running';
      snapshot.restoringBy = null;
      await this.sessionManager.transitionState(session.id, 'running', snapshot as unknown as Record<string, unknown>);
      return ctx.reply('⚠️ 题目加载失败');
    }

    const leakThreshold = ctx.configService.get<number>('soup.leak_keyword_threshold') ?? 2;
    const restoreResult = await callSoupRestore(
      this.llmRouter,
      puzzle,
      ctx.senderQQ,
      restoreText,
      leakThreshold,
    );

    if (!restoreResult.ok) {
      snapshot.phase = 'running';
      snapshot.restoringBy = null;
      await this.sessionManager.transitionState(session.id, 'running', snapshot as unknown as Record<string, unknown>);
      return ctx.reply('💥 还原判定失败，请稍后重试，游戏继续');
    }

    const { appPassed, coverage, summary, missing_critical_ids } = restoreResult.value;

    if (appPassed) {
      // 还原成功
      this.sessionManager.clearActivityTimeout(session.id);
      applyRestore(
        snapshot.contribution,
        ctx.senderQQ,
        coverage,
        ctx.configService.get<number>('soup.endgame_lookback_questions') ?? 10,
      );

      const finalScores = calcFinalScores(snapshot.contribution);
      const now = Math.floor(Date.now() / 1000);
      const durationSec = snapshot.startedAt ? now - snapshot.startedAt : 0;

      await this.sessionManager.transitionState(
        session.id,
        'ended',
        snapshot as unknown as Record<string, unknown>,
        { endedAt: now, endReason: 'restored' },
      );

      // 保存游玩记录
      for (const score of finalScores) {
        const p = snapshot.contribution.players[score.qq];
        await this.soupService.savePlayRecord({
          userQq: score.qq,
          puzzleId: puzzle.id,
          sessionId: session.id,
          result: score.qq === ctx.senderQQ ? 'won' : 'played',
          contributionScore: score.score,
          breakthroughCount: score.breakthroughCount,
          questionsAsked: score.questionsAsked,
          joinedAt: p?.joinedAt ?? now,
        });
      }

      // 总结文本
      const scoreText = finalScores
        .map((s, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          return `${medal} ${s.qq}  ${s.score.toFixed(1)}分（突破×${s.breakthroughCount}）`;
        })
        .join('\n');

      // LLM 总结点评
      const summaryData = await callSummary(
        this.llmRouter,
        puzzle,
        finalScores.map((s) => ({
          qq: s.qq,
          displayName: s.qq,
          score: s.score,
          breakthroughCount: s.breakthroughCount,
        })),
        true,
        durationSec,
      );

      const diffStars = '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty);
      await ctx.reply(
        `🎉 还原成功！游戏结束！\n\n` +
        `【真相揭晓】\n${puzzle.truth}\n\n` +
        `【贡献度排名】\n${scoreText}\n\n` +
        `【AI 点评】\n${summaryData.overall_comment}\n\n` +
        `📊 题目：《${puzzle.title}》${diffStars} · 用时 ${Math.floor(durationSec / 60)}分${durationSec % 60}秒`,
      );
    } else {
      // 还原失败
      snapshot.phase = 'running';
      snapshot.restoringBy = null;
      snapshot.directionRequestExpiresAt = Math.floor(Date.now() / 1000) + 60;
      await this.sessionManager.transitionState(
        session.id,
        'running',
        snapshot as unknown as Record<string, unknown>,
      );

      let failMsg = `❌ 还原未通过，游戏继续\n${summary}`;
      if (missing_critical_ids.length > 0) {
        failMsg += `\n（还有关键要素未还原到）`;
      }
      failMsg += `\n\n60秒内可输入 .soup direction 获取方向提示`;
      await ctx.reply(failMsg);
    }
  }

  // ── giveup ────────────────────────────────────────────────────────────────

  private async handleGiveup(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    const session = await this.getRunningSession(ctx);
    if (!session) return;

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;
    if (snapshot.phase !== 'running') return ctx.reply('⚠️ 游戏不在提问阶段');

    if (!session.members.includes(ctx.senderQQ)) return ctx.reply('⚠️ 你不在游戏中');

    if (!snapshot.giveupVotes.includes(ctx.senderQQ)) {
      snapshot.giveupVotes.push(ctx.senderQQ);
    }

    const threshold = Math.ceil(session.members.length / 2);
    const voteCount = snapshot.giveupVotes.length;

    if (voteCount < threshold) {
      this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);
      return ctx.reply(
        `🏳️ ${ctx.senderName} 投票放弃（${voteCount}/${threshold}）\n还需 ${threshold - voteCount} 人同意`,
      );
    }

    // 达到半数，放弃
    this.sessionManager.clearActivityTimeout(session.id);
    const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
    const now = Math.floor(Date.now() / 1000);
    const durationSec = snapshot.startedAt ? now - snapshot.startedAt : 0;

    const finalScores = calcFinalScores(snapshot.contribution);

    await this.sessionManager.transitionState(
      session.id,
      'ended',
      snapshot as unknown as Record<string, unknown>,
      { endedAt: now, endReason: 'giveup' },
    );

    for (const score of finalScores) {
      const p = snapshot.contribution.players[score.qq];
      await this.soupService.savePlayRecord({
        userQq: score.qq,
        puzzleId: puzzle?.id ?? '',
        sessionId: session.id,
        result: 'giveup',
        contributionScore: score.score,
        breakthroughCount: score.breakthroughCount,
        questionsAsked: score.questionsAsked,
        joinedAt: p?.joinedAt ?? now,
      });
    }

    const truthText = puzzle?.truth ?? '（无法加载真相）';
    const scoreText = finalScores
      .slice(0, 5)
      .map((s, i) => `${['🥇','🥈','🥉'][i] ?? `${i+1}.`} ${s.qq} ${s.score.toFixed(1)}分`)
      .join('\n');

    await ctx.reply(
      `🏳️ 全员放弃，游戏结束\n\n` +
      `【真相揭晓】\n${truthText}\n\n` +
      `【贡献度】\n${scoreText}\n\n` +
      `用时 ${Math.floor(durationSec / 60)}分${durationSec % 60}秒`,
    );
  }

  // ── change ────────────────────────────────────────────────────────────────

  private async handleChange(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    const roomId = await this.sessionManager.getRoomIdByGroupId(ctx.groupId, 'qq');
    if (!roomId) return ctx.reply('⚠️ 当前群没有进行中的游戏');

    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session) return ctx.reply('⚠️ 当前群没有进行中的游戏');

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;

    // setup 阶段：仅发起人可换，清空条件
    if (session.state === 'setup') {
      if (session.createdBy !== ctx.senderQQ) {
        return ctx.reply('⚠️ 只有发起人可以换题条件');
      }
      snapshot.setupFilters = { difficulty: null, tags: [] };
      this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);
      return ctx.reply('✅ 已清空筛选条件，可重新设置（.soup difficulty / .soup tags）');
    }

    // running 阶段
    if (session.state === 'running' && snapshot.phase === 'running') {
      const qCount = snapshot.contribution.questionLog.length;

      if (!session.members.includes(ctx.senderQQ)) {
        return ctx.reply('⚠️ 你不在游戏中');
      }

      // 单人：直接处理
      if (session.members.length === 1) {
        return this.doChange(session.id, ctx, snapshot, qCount);
      }

      // 多人：投票
      if (!snapshot.changeVotes.includes(ctx.senderQQ)) {
        snapshot.changeVotes.push(ctx.senderQQ);
        snapshot.changeInitiator = snapshot.changeInitiator ?? ctx.senderQQ;
      }

      const threshold = Math.ceil(session.members.length / 2);
      if (snapshot.changeVotes.length < threshold) {
        this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);
        const warnText = qCount >= 1 ? '（换题将视为放弃并公布真相）' : '（无人提问，可直接换题）';
        return ctx.reply(
          `🔄 ${ctx.senderName} 发起换题投票 ${warnText}\n已同意 ${snapshot.changeVotes.length}/${threshold}`,
        );
      }

      return this.doChange(session.id, ctx, snapshot, qCount);
    }

    return ctx.reply('⚠️ 当前状态不支持换题');
  }

  private async doChange(
    sessionId: string,
    ctx: CommandContext,
    snapshot: SoupRuntimeState,
    qCount: number,
  ): Promise<void> {
    if (qCount >= 1) {
      // 公布真相，计为失败
      const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
      await ctx.reply(
        `🔄 换题！游戏结算...\n\n【真相揭晓】\n${puzzle?.truth ?? '（加载失败）'}`,
      );
    } else {
      await ctx.reply('🔄 换题，不计为失败');
    }

    // 重置为 setup 阶段
    snapshot.phase = 'setup';
    snapshot.currentPuzzleId = null;
    snapshot.setupFilters = { difficulty: null, tags: [] };
    snapshot.giveupVotes = [];
    snapshot.changeVotes = [];
    snapshot.changeInitiator = null;
    snapshot.givenHintIndices = [];
    snapshot.lastHintAt = null;

    this.sessionManager.clearActivityTimeout(sessionId);
    await this.sessionManager.transitionState(
      sessionId,
      'setup',
      snapshot as unknown as Record<string, unknown>,
    );

    // 注册 setup 超时
    const setupMs = (ctx.configService.get<number>('soup.setup_idle_minutes') ?? 3) * 60_000;
    this.sessionManager.registerActivityTimeout(sessionId, setupMs, async () => {
      await ctx.reply('⏰ 选题超时，本局游戏已取消');
      await this.sessionManager.transitionState(sessionId, 'aborted', snapshot as unknown as Record<string, unknown>, {
        endedAt: Math.floor(Date.now() / 1000),
        endReason: 'setup_timeout',
      });
    });

    await ctx.reply('✅ 已重置，可重新设置条件后 .soup go 开始');
  }

  // ── direction ─────────────────────────────────────────────────────────────

  private async handleDirection(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    const session = await this.getRunningSession(ctx);
    if (!session) return;

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;
    if (snapshot.phase !== 'running') return ctx.reply('⚠️ 游戏不在提问阶段');

    const now = Math.floor(Date.now() / 1000);
    if (!snapshot.directionRequestExpiresAt || now > snapshot.directionRequestExpiresAt) {
      return ctx.reply('⚠️ 方向提示已过期（仅在还原失败后 60 秒内有效）');
    }

    const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
    if (!puzzle) return ctx.reply('⚠️ 题目加载失败');

    // 给出未触发的 critical key_points 的模糊化描述（K17.2）
    const triggeredIds = Object.keys(snapshot.contribution.keyPointsTriggered);
    const missingCritical = puzzle.keyPoints.filter(
      (kp) => kp.critical && !triggeredIds.includes(kp.id),
    );

    if (missingCritical.length === 0) {
      return ctx.reply('🧭 所有关键线索都已触发，继续深入思考真相的整体逻辑');
    }

    const directions = missingCritical
      .map((kp) => `• ${kp.description.slice(0, 20)}...（尝试从这个方向提问）`)
      .join('\n');

    snapshot.directionRequestExpiresAt = null;
    this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);

    await ctx.reply(`🧭 方向提示：\n${directions}`);
  }

  // ── submit ────────────────────────────────────────────────────────────────

  private async handleSubmit(ctx: CommandContext, _args: string): Promise<void> {
    // 简化版：通过私聊提交，格式 .soup submit
    // 引导用户使用 WebUI 录题（更丰富），或者启动多步对话
    await ctx.replyPrivate(
      `🐢 感谢你想要投稿！\n\n` +
      `【投稿方式】\n` +
      `1. 直接在管理后台录入（推荐）\n` +
      `2. 私聊格式投稿（按提示一步步填写）\n\n` +
      `私聊投稿请发送：\n` +
      `.soup submit start\n开始多步投稿流程`,
    );
  }

  // ── 超时回调 ──────────────────────────────────────────────────────────────

  private async onSetupTimeout(
    sessionId: string,
    _groupId: string,
    ctx: CommandContext,
  ): Promise<void> {
    log.info({ sessionId }, '[soup] setup 超时');
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || !['setup'].includes(session.state)) return;

    await this.sessionManager.transitionState(sessionId, 'aborted', session.stateSnapshot, {
      endedAt: Math.floor(Date.now() / 1000),
      endReason: 'setup_timeout',
    });

    await ctx.reply(`⏰ 选题超时（3分钟），本局海龟汤已自动取消`);
  }

  private async onIdleTimeout(
    sessionId: string,
    _groupId: string,
    puzzle: SoupPuzzleData,
    snapshot: SoupRuntimeState,
    ctx: CommandContext,
  ): Promise<void> {
    log.info({ sessionId }, '[soup] running 无活动超时');
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || session.state !== 'running') return;

    await ctx.reply(
      `⏰ 超过 30 分钟没有提问了，游戏即将结束\n` +
      `• .soup continue 继续游戏\n` +
      `• .soup end 结束游戏\n` +
      `（5 分钟内无响应将自动结束）`,
    );

    // 宽限 5 分钟
    const graceMs = (ctx.configService.get<number>('soup.idle_grace_minutes') ?? 5) * 60_000;
    this.sessionManager.registerActivityTimeout(sessionId, graceMs, async () => {
      const s = await this.sessionManager.getSessionById(sessionId);
      if (!s || s.state !== 'running') return;

      const now = Math.floor(Date.now() / 1000);
      await this.sessionManager.transitionState(sessionId, 'ended', snapshot as unknown as Record<string, unknown>, {
        endedAt: now,
        endReason: 'timeout',
      });

      await ctx.reply(
        `⏰ 宽限期结束，游戏超时结束\n\n` +
        `【真相揭晓】\n${puzzle.truth}`,
      );
    });
  }

  // ── 工具方法 ─────────────────────────────────────────────────────────────

  private async getRunningSession(ctx: CommandContext) {
    if (!ctx.groupId) return null;
    const roomId = await this.sessionManager.getRoomIdByGroupId(ctx.groupId, 'qq');
    if (!roomId) {
      await ctx.reply('⚠️ 当前群没有进行中的游戏，输入 .soup start 开始');
      return null;
    }
    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session) {
      await ctx.reply('⚠️ 当前群没有进行中的游戏，输入 .soup start 开始');
      return null;
    }
    return session;
  }

  private async loadCurrentPuzzle(puzzleId: string | null): Promise<SoupPuzzleData | null> {
    if (!puzzleId) return null;
    const result = await this.soupService.getPuzzleById(puzzleId);
    return result.ok ? result.value : null;
  }

  private buildHelpText(prefix: string): string {
    return (
      `🐢 海龟汤指令帮助：\n` +
      `${prefix}soup start      — 发起一局游戏\n` +
      `${prefix}soup join       — 加入当前游戏\n` +
      `${prefix}soup difficulty <1-5> — 设置难度\n` +
      `${prefix}soup tags <标签>     — 设置标签偏好\n` +
      `${prefix}soup go         — 出题，开始游戏\n` +
      `${prefix}soup ask <问题> — 提问\n` +
      `${prefix}soup hint       — 请求提示\n` +
      `${prefix}soup restore <答案> — 提交还原\n` +
      `${prefix}soup giveup     — 投票放弃\n` +
      `${prefix}soup change     — 换题\n` +
      `${prefix}soup submit     — 投稿题目`
    );
  }
}
