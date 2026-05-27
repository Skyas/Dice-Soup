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
  recordRestoreAttempt,
  applyHint,
  calcFinalScores,
  assertInvariant,
} from '../../modules/soup/contribution';
import { callSoupJudge, callSoupRestore, callSummary, callExtractMetadata } from '../../modules/soup/soup-llm';

const log = createLogger({ module: 'cmd:soup' });

const VERDICT_DISPLAY: Record<string, string> = {
  yes: '✅ 是',
  no: '❌ 否',
  partial: '〜 部分正确',
  unimportant: '🤷 不重要（可换方向）',
  irrelevant: '🔄 与本题无关',
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

  // ── VIP 工具 ──────────────────────────────────────────────────────────────

  /** VIP 判断：QQ 在 soup.vip_qq_list 中 */
  private isVip(ctx: CommandContext): boolean {
    const list = ctx.configService.get<string[]>('soup.vip_qq_list') ?? [];
    return list.map(String).includes(String(ctx.senderQQ));
  }

  /**
   * 返回有效的群/房间 ID：
   * - 群聊：直接返回 groupId
   * - 私聊 VIP：返回 dm_<qq>（虚拟房间，单人专属）
   * - 私聊非 VIP：返回 null
   */
  private getEffectiveGroupId(ctx: CommandContext): string | null {
    if (ctx.groupId) return ctx.groupId;
    if (this.isVip(ctx)) return `dm_${ctx.senderQQ}`;
    return null;
  }

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
      case 'end': return this.handleEnd(ctx);
      case 'continue': return this.handleContinue(ctx);
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
    const effectiveGroupId = this.getEffectiveGroupId(ctx);
    if (!effectiveGroupId) {
      return ctx.reply('⚠️ 海龟汤只能在群里开局（VIP 可私聊开局）');
    }

    const ensured = await ctx.userService.ensureUserExists(ctx.senderQQ, ctx.senderName);
    if (!ensured.ok) {
      return ctx.reply('注册用户失败，请稍后重试');
    }

    const initialState = initialSoupState();
    initialState.contribution = initContributionState([ctx.senderQQ]);
    initialState.contribution.players[ctx.senderQQ].joinedAt = Math.floor(Date.now() / 1000);
    initialState.playerNames[ctx.senderQQ] = ctx.senderName;

    const result = await this.sessionManager.createSession(
      effectiveGroupId,
      'qq',
      ctx.senderQQ,
      initialState as unknown as Record<string, unknown>,
    );

    if (!result.ok) {
      return ctx.reply(`⚠️ ${result.reason}`);
    }

    const sessionId = result.sessionId;
    const isDM = !ctx.groupId;
    log.info({ sessionId, senderQQ: ctx.senderQQ, isDM }, '[soup] 会话创建');

    // 注册 setup 超时（3 分钟）
    const setupTimeoutMs = (ctx.configService.get<number>('soup.setup_idle_minutes') ?? 3) * 60_000;
    this.sessionManager.registerActivityTimeout(sessionId, setupTimeoutMs, async () => {
      await this.onSetupTimeout(sessionId, effectiveGroupId, ctx);
    });

    const dmHint = isDM ? '\n（私聊单人模式，.soup go 直接开始）' : '\n  • .soup join              其他人加入';
    await ctx.reply(
      `🐢 海龟汤！${ctx.senderName} 发起了一局游戏！\n` +
      `可选操作：\n` +
      `  • .soup difficulty <1-5>  设置难度\n` +
      `  • .soup tags <标签>       设置标签偏好\n` +
      dmHint + '\n' +
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
    if (!snapshot.playerNames) snapshot.playerNames = {};
    snapshot.playerNames[ctx.senderQQ] = ctx.senderName;
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
          `🐢 当前进行中的游戏\n\n` +
          `【汤面】\n${puzzle.surface}\n\n` +
          `【近期提问记录】\n${historyLines || '（暂无）'}`,
        );
      }
    }
  }

  // ── difficulty ────────────────────────────────────────────────────────────

  private async handleDifficulty(ctx: CommandContext, args: string): Promise<void> {
    const effectiveGroupId = this.getEffectiveGroupId(ctx);
    if (!effectiveGroupId) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');

    const roomId = await this.sessionManager.getRoomIdByGroupId(effectiveGroupId, 'qq');
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
    const effectiveGroupId = this.getEffectiveGroupId(ctx);
    if (!effectiveGroupId) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');

    const roomId = await this.sessionManager.getRoomIdByGroupId(effectiveGroupId, 'qq');
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
    const effectiveGroupId = this.getEffectiveGroupId(ctx);
    if (!effectiveGroupId) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');

    const roomId = await this.sessionManager.getRoomIdByGroupId(effectiveGroupId, 'qq');
    if (!roomId) return ctx.reply('⚠️ 当前群没有进行中的游戏');

    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session || session.state !== 'setup') {
      return ctx.reply('⚠️ 只能在选题阶段使用此命令');
    }
    if (session.createdBy !== ctx.senderQQ) {
      return ctx.reply('⚠️ 只有发起人可以开始游戏');
    }

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;

    // VIP 可重复游玩同题；普通玩家排除已玩题目
    const excludeIds = new Set<string>();
    if (!this.isVip(ctx)) {
      for (const qq of session.members) {
        const played = await this.soupService.getPlayedPuzzleIds(qq);
        played.forEach((id) => excludeIds.add(id));
      }
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

    let puzzle = selectResult.value;

    // §3.4.4 路径 C：若 metadata 未提取（keyPoints 为空），自动提取后开局
    if (puzzle.keyPoints.length === 0 || puzzle.sensitiveWords.length === 0) {
      log.info({ puzzleId: puzzle.id }, '[soup] 题目无 metadata，自动提取...');
      await ctx.reply('🔍 正在分析题目元数据，请稍候...');
      const metaResult = await callExtractMetadata(this.llmRouter, puzzle, ctx.configService.getOptional<string>('soup.prompt.extract_metadata'));
      if (metaResult.ok) {
        await this.soupService.updatePuzzle(puzzle.id, {
          keyPoints: metaResult.value.key_points,
          sensitiveWords: metaResult.value.sensitive_words,
        });
        const reloaded = await this.soupService.getPuzzleById(puzzle.id);
        if (reloaded.ok) puzzle = reloaded.value;
        log.info({ puzzleId: puzzle.id, kpCount: puzzle.keyPoints.length }, '[soup] metadata 提取完成');
      } else {
        log.warn({ puzzleId: puzzle.id }, '[soup] metadata 提取失败，使用空 keyPoints 继续');
      }
    }

    const now = Math.floor(Date.now() / 1000);

    // 更新快照
    snapshot.phase = 'running';
    snapshot.currentPuzzleId = puzzle.id;
    snapshot.startedAt = now;
    snapshot.contribution = initContributionState(session.members);
    snapshot.giveupVotes = [];
    snapshot.changeVotes = [];
    snapshot.givenHintIndices = [];
    snapshot.inGracePeriod = false;
    snapshot.restoringBy = null;
    snapshot.restoringExpiresAt = null;
    snapshot.directionRequestExpiresAt = null;

    this.sessionManager.clearActivityTimeout(session.id);

    await this.sessionManager.transitionState(
      session.id,
      'running',
      snapshot as unknown as Record<string, unknown>,
      { startedAt: now },
    );

    await this.soupService.incrementPlayCount(puzzle.id);

    // 注册活动超时（默认 45 分钟）
    const idleTimeoutMin = ctx.configService.get<number>('soup.idle_timeout_minutes') ?? 45;
    const idleMs = idleTimeoutMin * 60_000;
    this.sessionManager.registerActivityTimeout(session.id, idleMs, async () => {
      await this.onIdleTimeout(session.id, ctx.groupId!, puzzle, snapshot, ctx);
    });

    const diffStars = '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty);

    await ctx.reply(
      `🐢 游戏开始！\n` +
      `难度：${diffStars}\n` +
      `\n【汤面】\n${puzzle.surface}\n\n` +
      `用 .soup ask <问题> 提问，用 .soup restore <答案> 还原真相。`,
    );
  }

  // ── ask ───────────────────────────────────────────────────────────────────

  private async handleAsk(ctx: CommandContext, question: string): Promise<void> {
    if (!this.getEffectiveGroupId(ctx)) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');
    if (!question.trim()) return ctx.reply('⚠️ 请输入问题，例如：.soup ask 凶手认识被害者吗？');

    const session = await this.getRunningSession(ctx);
    if (!session) return;

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;

    if (snapshot.phase === 'restoring') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (snapshot.restoringExpiresAt && nowSec > snapshot.restoringExpiresAt) {
        // 还原超时（服务重启后计时器丢失的情况），自动重置
        snapshot.phase = 'running';
        snapshot.restoringBy = null;
        snapshot.restoringExpiresAt = null;
        await this.sessionManager.transitionState(session.id, 'running', snapshot as unknown as Record<string, unknown>);
        // 继续处理本次提问（fall through）
      } else {
        const restoreTimeoutMin = ctx.configService.get<number>('soup.restore_timeout_minutes') ?? 5;
        const remainSec = snapshot.restoringExpiresAt ? Math.max(0, snapshot.restoringExpiresAt - nowSec) : restoreTimeoutMin * 60;
        const remainMin = Math.ceil(remainSec / 60);
        return ctx.reply(`⏳ 还原进行中，请暂停提问（约 ${remainMin} 分钟后自动解锁）`);
      }
    }
    if (snapshot.phase !== 'running') {
      return ctx.reply('⚠️ 游戏尚未开始');
    }

    if (!session.members.includes(ctx.senderQQ)) {
      return ctx.reply('⚠️ 请先加入游戏：.soup join');
    }

    // 每次提问时刷新显示名称（群名片可能变化）
    if (!snapshot.playerNames) snapshot.playerNames = {};
    snapshot.playerNames[ctx.senderQQ] = ctx.senderName;

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
      async (hitWords) => {
        await ctx.auditService.log({
          category: 'leak_intercept',
          actor: ctx.senderQQ,
          actorType: 'player',
          action: 'LEAK_BLOCKED',
          target: session.id,
          severity: 'warning',
          meta: { hitWords, task: 'soup_judge', sessionId: session.id },
        });
      },
      ctx.configService.getOptional<string>('soup.prompt.judge'),
    );

    if (!judgeResult.ok) {
      log.error({ err: judgeResult.error, sessionId: session.id, senderQQ: ctx.senderQQ }, '[soup] ask 判定失败');
      return ctx.reply(`💥 判定失败：${judgeResult.error.message}`);
    }

    const { verdict, confidence, matched_key_points } = judgeResult.value;

    // 更新贡献度（同时将问题原文写入 questionLog）
    const { breakthroughIds } = applyAsk(
      snapshot.contribution,
      ctx.senderQQ,
      verdict,
      matched_key_points,
      puzzle.keyPoints,
      question,
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

    // 宽限期结束（有新活动即退出宽限期）
    snapshot.inGracePeriod = false;
    this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);

    // 重置活动计时器
    const idleMs = (ctx.configService.get<number>('soup.idle_timeout_minutes') ?? 45) * 60_000;
    this.sessionManager.resetActivityTimer(session.id, idleMs, async () => {
      await this.onIdleTimeout(session.id, this.getEffectiveGroupId(ctx) ?? '', puzzle, snapshot, ctx);
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
    if (!this.getEffectiveGroupId(ctx)) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');

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
    if (!this.getEffectiveGroupId(ctx)) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');
    if (!restoreText.trim()) return ctx.reply('⚠️ 请输入还原内容，例如：.soup restore 真相是...');

    const session = await this.getRunningSession(ctx);
    if (!session) return;

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;

    // restoring 阶段：给出明确反馈而不是泛用错误
    if (snapshot.phase === 'restoring') {
      const nowSec2 = Math.floor(Date.now() / 1000);
      if (snapshot.restoringExpiresAt && nowSec2 > snapshot.restoringExpiresAt) {
        // 超时了，重置后继续处理
        snapshot.phase = 'running';
        snapshot.restoringBy = null;
        snapshot.restoringExpiresAt = null;
        await this.sessionManager.transitionState(session.id, 'running', snapshot as unknown as Record<string, unknown>);
      } else if (snapshot.restoringBy === ctx.senderQQ) {
        return ctx.reply('⏳ 还原判定进行中，请稍等片刻...');
      } else {
        const restoreTimeoutMin2 = ctx.configService.get<number>('soup.restore_timeout_minutes') ?? 5;
        const remainSec2 = snapshot.restoringExpiresAt
          ? Math.max(0, snapshot.restoringExpiresAt - nowSec2)
          : restoreTimeoutMin2 * 60;
        const remainMin2 = Math.ceil(remainSec2 / 60);
        return ctx.reply(`⏳ 有玩家正在还原，请暂停提问（约 ${remainMin2} 分钟后自动解锁）`);
      }
    }

    if (snapshot.phase !== 'running') return ctx.reply('⚠️ 游戏不在提问阶段');
    if (!session.members.includes(ctx.senderQQ)) return ctx.reply('⚠️ 请先加入游戏：.soup join');

    const restoreTimeoutMin = ctx.configService.get<number>('soup.restore_timeout_minutes') ?? 5;
    const restoreTimeoutMs = restoreTimeoutMin * 60_000;
    const nowSec = Math.floor(Date.now() / 1000);

    // 设置 restoring 锁 + 过期时间戳
    snapshot.phase = 'restoring';
    snapshot.restoringBy = ctx.senderQQ;
    snapshot.restoringExpiresAt = nowSec + restoreTimeoutMin * 60;
    await this.sessionManager.transitionState(
      session.id,
      'restoring',
      snapshot as unknown as Record<string, unknown>,
    );

    await ctx.reply(`🔍 ${ctx.senderName} 提交还原，判定中...（其他玩家请暂停提问）`);

    const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
    if (!puzzle) {
      snapshot.phase = 'running';
      snapshot.restoringBy = null;
      snapshot.restoringExpiresAt = null;
      await this.sessionManager.transitionState(session.id, 'running', snapshot as unknown as Record<string, unknown>);
      return ctx.reply('⚠️ 题目加载失败');
    }

    const leakThreshold = ctx.configService.get<number>('soup.leak_keyword_threshold') ?? 2;

    // 超时竞争：若 LLM 在 restoreTimeoutMs 内未返回，视为还原失败
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RESTORE_TIMEOUT')), restoreTimeoutMs),
    );

    const onRestoreLeakDetected = async (hitWords: string[]) => {
      await ctx.auditService.log({
        category: 'leak_intercept',
        actor: ctx.senderQQ,
        actorType: 'player',
        action: 'LEAK_BLOCKED',
        target: session.id,
        severity: 'warning',
        meta: { hitWords, task: 'soup_restore', sessionId: session.id },
      });
    };

    let restoreResult: Awaited<ReturnType<typeof callSoupRestore>>;
    try {
      restoreResult = await Promise.race([
        callSoupRestore(this.llmRouter, puzzle, ctx.senderQQ, restoreText, leakThreshold, onRestoreLeakDetected, ctx.configService.getOptional<string>('soup.prompt.restore')),
        timeoutPromise,
      ]);
    } catch (e: any) {
      if (e?.message === 'RESTORE_TIMEOUT') {
        // 重新从 DB 取最新快照（LLM 仍在后台运行，避免用旧 snapshot）
        const freshSession = await this.sessionManager.getSessionById(session.id);
        if (freshSession && freshSession.state === 'restoring') {
          const freshSnap = freshSession.stateSnapshot as unknown as SoupRuntimeState;
          freshSnap.phase = 'running';
          freshSnap.restoringBy = null;
          freshSnap.restoringExpiresAt = null;
          await this.sessionManager.transitionState(
            session.id, 'running', freshSnap as unknown as Record<string, unknown>,
          );
        }
        return ctx.reply(`⏰ 还原判定超时（${restoreTimeoutMin}分钟），视为失败，游戏继续`);
      }
      // 其他异常
      log.error({ err: e, sessionId: session.id, senderQQ: ctx.senderQQ }, '[soup] restore 异常');
      snapshot.phase = 'running';
      snapshot.restoringBy = null;
      snapshot.restoringExpiresAt = null;
      await this.sessionManager.transitionState(session.id, 'running', snapshot as unknown as Record<string, unknown>);
      return ctx.reply(`💥 还原判定失败：${e?.message ?? '未知异常'}，游戏继续`);
    }

    if (!restoreResult.ok) {
      log.error({ err: restoreResult.error, sessionId: session.id, senderQQ: ctx.senderQQ }, '[soup] restore 判定失败');
      snapshot.phase = 'running';
      snapshot.restoringBy = null;
      snapshot.restoringExpiresAt = null;
      await this.sessionManager.transitionState(session.id, 'running', snapshot as unknown as Record<string, unknown>);
      return ctx.reply(`💥 还原判定失败：${restoreResult.error.message}，游戏继续`);
    }

    const { appPassed, coverage, missing_critical_ids } = restoreResult.value;

    if (appPassed) {
      // 还原成功：先记录本次还原尝试，再结算分数
      recordRestoreAttempt(snapshot.contribution, ctx.senderQQ, restoreText, true, coverage, missing_critical_ids);
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
          result: score.qq === ctx.senderQQ ? 'win' : 'played',
          contributionScore: score.score,
          breakthroughCount: score.breakthroughCount,
          questionsAsked: score.questionsAsked,
          joinedAt: p?.joinedAt ?? now,
        });
      }

      // 总结文本（格式：名称（QQ）分数）
      const pNames = snapshot.playerNames ?? {};
      const scoreText = finalScores
        .map((s, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          const name = pNames[s.qq] ? `${pNames[s.qq]}（${s.qq}）` : s.qq;
          return `${medal} ${name}  ${s.score.toFixed(1)}分（突破×${s.breakthroughCount}）`;
        })
        .join('\n');

      // LLM 总结点评（传入提问历史，让 AI 言之有物）
      const summaryData = await callSummary(
        this.llmRouter,
        puzzle,
        finalScores.map((s) => ({
          qq: s.qq,
          displayName: pNames[s.qq] ?? s.qq,
          score: s.score,
          breakthroughCount: s.breakthroughCount,
        })),
        true,
        durationSec,
        snapshot.contribution.questionLog,
        pNames,
        ctx.configService.getOptional<string>('soup.prompt.summary'),
      );

      const diffStars = '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty);
      const tagsLine = puzzle.tags.length > 0 ? ` · 标签：${puzzle.tags.join(' ')}` : '';
      await ctx.reply(
        `🎉 还原成功！游戏结束！\n\n` +
        `【真相揭晓】\n${puzzle.truth}\n\n` +
        `【贡献度排名】\n${scoreText}\n\n` +
        `【AI 点评】\n${summaryData.overall_comment}\n\n` +
        `📊 《${puzzle.title}》${diffStars}${tagsLine} · 用时 ${Math.floor(durationSec / 60)}分${durationSec % 60}秒`,
      );
    } else {
      // 还原失败：先记录本次还原尝试
      recordRestoreAttempt(snapshot.contribution, ctx.senderQQ, restoreText, false, coverage, missing_critical_ids);
      snapshot.phase = 'running';
      snapshot.restoringBy = null;
      snapshot.restoringExpiresAt = null;
      snapshot.directionRequestExpiresAt = Math.floor(Date.now() / 1000) + 60;
      await this.sessionManager.transitionState(
        session.id,
        'running',
        snapshot as unknown as Record<string, unknown>,
      );

      // summary 是 LLM 内部评估，可能含真相关键词，不直接展示
      // 用 coverage 驱动一句无泄露的鼓励文字
      const pct = Math.round(coverage * 100);
      let failMsg = `❌ 还原未通过，游戏继续\n`;
      if (pct >= 60) {
        failMsg += `💡 思路很接近了（覆盖度约 ${pct}%），继续深入提问！`;
      } else if (pct >= 30) {
        failMsg += `💡 有一些关键点（覆盖度约 ${pct}%），还需要更多发现。`;
      } else {
        failMsg += `💡 继续提问，慢慢找到关键线索吧！`;
      }
      if (missing_critical_ids.length > 0) {
        failMsg += `\n（还有必要要素未涉及）`;
      }
      failMsg += `\n\n60秒内可输入 .soup direction 获取方向提示`;
      await ctx.reply(failMsg);
    }
  }

  // ── giveup ────────────────────────────────────────────────────────────────

  private async handleGiveup(ctx: CommandContext): Promise<void> {
    if (!this.getEffectiveGroupId(ctx)) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');

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
    const gvNames = snapshot.playerNames ?? {};
    const scoreText = finalScores
      .slice(0, 5)
      .map((s, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
        const name = gvNames[s.qq] ? `${gvNames[s.qq]}（${s.qq}）` : s.qq;
        return `${medal} ${name}  ${s.score.toFixed(1)}分`;
      })
      .join('\n');

    const gvDiffStars = puzzle ? '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty) : '';
    const gvTagsLine = puzzle?.tags?.length ? ` · 标签：${puzzle.tags.join(' ')}` : '';
    await ctx.reply(
      `🏳️ 全员放弃，游戏结束\n\n` +
      `【真相揭晓】\n${truthText}\n\n` +
      `【贡献度】\n${scoreText}\n\n` +
      (puzzle ? `📊 《${puzzle.title}》${gvDiffStars}${gvTagsLine}\n` : '') +
      `用时 ${Math.floor(durationSec / 60)}分${durationSec % 60}秒`,
    );
  }

  // ── end（宽限期快速结束） ──────────────────────────────────────────────────

  private async handleEnd(ctx: CommandContext): Promise<void> {
    if (!this.getEffectiveGroupId(ctx)) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');

    const session = await this.getRunningSession(ctx);
    if (!session) return;

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;
    if (snapshot.phase !== 'running') return ctx.reply('⚠️ 游戏不在提问阶段');
    if (!session.members.includes(ctx.senderQQ)) return ctx.reply('⚠️ 你不在游戏中');

    // 仅宽限期内可用（避免成员随意终止正在进行的游戏）
    if (!snapshot.inGracePeriod) {
      return ctx.reply('⚠️ 游戏正常进行中，如需提前结束请使用 .soup giveup 投票');
    }

    this.sessionManager.clearActivityTimeout(session.id);
    const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
    const now = Math.floor(Date.now() / 1000);
    const durationSec = snapshot.startedAt ? now - snapshot.startedAt : 0;
    const finalScores = calcFinalScores(snapshot.contribution);

    snapshot.inGracePeriod = false;
    await this.sessionManager.transitionState(
      session.id,
      'ended',
      snapshot as unknown as Record<string, unknown>,
      { endedAt: now, endReason: 'timeout' },
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

    const endDiffStars = puzzle ? '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty) : '';
    const endTagsLine = puzzle?.tags?.length ? ` · 标签：${puzzle.tags.join(' ')}` : '';
    await ctx.reply(
      `⏰ ${ctx.senderName} 确认结束游戏\n\n` +
      `【真相揭晓】\n${puzzle?.truth ?? '（无法加载真相）'}\n\n` +
      (puzzle ? `📊 《${puzzle.title}》${endDiffStars}${endTagsLine}\n` : '') +
      `用时 ${Math.floor(durationSec / 60)}分${durationSec % 60}秒`,
    );
  }

  // ── continue（宽限期延续）────────────────────────────────────────────────

  private async handleContinue(ctx: CommandContext): Promise<void> {
    const effectiveGroupId = this.getEffectiveGroupId(ctx);
    if (!effectiveGroupId) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');

    const session = await this.getRunningSession(ctx);
    if (!session) return;

    const snapshot = session.stateSnapshot as unknown as SoupRuntimeState;
    if (snapshot.phase !== 'running') return ctx.reply('⚠️ 游戏不在提问阶段');
    if (!session.members.includes(ctx.senderQQ)) return ctx.reply('⚠️ 你不在游戏中');

    const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
    if (!puzzle) return ctx.reply('⚠️ 题目加载失败，无法延续');

    // 清除宽限期标记，重置计时器
    snapshot.inGracePeriod = false;
    this.sessionManager.saveSnapshot(session.id, snapshot as unknown as Record<string, unknown>);

    const idleTimeoutMin = ctx.configService.get<number>('soup.idle_timeout_minutes') ?? 45;
    const idleMs = idleTimeoutMin * 60_000;
    this.sessionManager.resetActivityTimer(session.id, idleMs, async () => {
      await this.onIdleTimeout(session.id, effectiveGroupId, puzzle, snapshot, ctx);
    });

    await ctx.reply(`✅ ${ctx.senderName} 延续游戏！计时器已重置（${idleTimeoutMin}分钟内无活动将再次提醒）`);
  }

  // ── change ────────────────────────────────────────────────────────────────

  private async handleChange(ctx: CommandContext): Promise<void> {
    const effectiveGroupId = this.getEffectiveGroupId(ctx);
    if (!effectiveGroupId) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');

    const roomId = await this.sessionManager.getRoomIdByGroupId(effectiveGroupId, 'qq');
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
      // 公布真相，计为失败，保存游玩记录
      const puzzle = await this.loadCurrentPuzzle(snapshot.currentPuzzleId);
      const chDiffStars = puzzle ? '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty) : '';
      const chTagsLine = puzzle?.tags?.length ? ` · 标签：${puzzle.tags.join(' ')}` : '';
      await ctx.reply(
        `🔄 换题！游戏结算...\n\n` +
        `【真相揭晓】\n${puzzle?.truth ?? '（加载失败）'}\n\n` +
        (puzzle ? `📊 《${puzzle.title}》${chDiffStars}${chTagsLine}` : ''),
      );

      // 保存各玩家的 giveup 记录
      if (puzzle) {
        const finalScores = calcFinalScores(snapshot.contribution);
        const now = Math.floor(Date.now() / 1000);
        for (const score of finalScores) {
          const p = snapshot.contribution.players[score.qq];
          await this.soupService.savePlayRecord({
            userQq: score.qq,
            puzzleId: puzzle.id,
            sessionId,
            result: 'giveup',
            contributionScore: score.score,
            breakthroughCount: score.breakthroughCount,
            questionsAsked: score.questionsAsked,
            joinedAt: p?.joinedAt ?? now,
          });
        }
      }
    } else {
      await ctx.reply('🔄 换题，不计为失败');
    }

    // 重置为 setup 阶段（贡献度等数据在下次 .soup go 时重新初始化）
    snapshot.phase = 'setup';
    snapshot.currentPuzzleId = null;
    snapshot.setupFilters = { difficulty: null, tags: [] };
    snapshot.giveupVotes = [];
    snapshot.changeVotes = [];
    snapshot.changeInitiator = null;
    snapshot.givenHintIndices = [];
    snapshot.lastHintAt = null;
    snapshot.inGracePeriod = false;
    snapshot.restoringBy = null;
    snapshot.restoringExpiresAt = null;
    snapshot.directionRequestExpiresAt = null;

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
    if (!this.getEffectiveGroupId(ctx)) return ctx.reply('⚠️ 请在群里使用此命令（VIP 可私聊）');

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

  private async handleSubmit(ctx: CommandContext, rawContent: string): Promise<void> {
    const content = rawContent.trim();

    // 无内容或发送了 "start" → 显示格式说明
    if (!content || content.toLowerCase() === 'start') {
      await ctx.replyPrivate(
        `🐢 【海龟汤题目投稿】\n\n` +
        `请在私聊中一次发送以下格式：\n\n` +
        `.soup submit\n` +
        `标题: 你的题目名称\n` +
        `汤面: 表面故事（玩家看到的）\n` +
        `真相: 完整真相\n` +
        `难度: 3\n` +
        `标签: 悬疑,推理（可选，逗号分隔）\n\n` +
        `📌 投稿后题目进入草稿状态，管理员审核后才会进入题库。`,
      );
      return;
    }

    // 解析格式化内容
    const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
    const getValue = (...keys: string[]): string | null => {
      for (const key of keys) {
        const line = lines.find((l) => l.startsWith(key));
        if (line) return line.slice(key.length).trim();
      }
      return null;
    };

    const title   = getValue('标题:', '标题：');
    const surface = getValue('汤面:', '汤面：', '表面:', '表面：');
    const truth   = getValue('真相:', '真相：');
    const diffStr = getValue('难度:', '难度：') ?? '3';
    const tagsStr = getValue('标签:', '标签：');

    // 验证必填项
    const missing: string[] = [];
    if (!title)   missing.push('标题');
    if (!surface) missing.push('汤面');
    if (!truth)   missing.push('真相');
    if (missing.length > 0) {
      await ctx.reply(
        `⚠️ 格式不完整，缺少：${missing.join('、')}\n发送 .soup submit 查看格式说明`,
      );
      return;
    }

    const difficulty = parseInt(diffStr, 10);
    if (isNaN(difficulty) || difficulty < 1 || difficulty > 5) {
      await ctx.reply('⚠️ 难度必须为 1~5 的整数，例如：难度: 3');
      return;
    }

    const tags = tagsStr
      ? tagsStr.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean)
      : [];

    // 确保用户已注册
    await ctx.userService.ensureUserExists(ctx.senderQQ, ctx.senderName);

    // 创建草稿题目
    const result = await this.soupService.createPuzzle(
      { title: title!, surface: surface!, truth: truth!, difficulty, tags, source: 'user_submit' },
      ctx.senderQQ,
    );

    if (!result.ok) {
      await ctx.reply(`💥 投稿失败：${result.error.message}`);
      return;
    }

    log.info({ puzzleId: result.value.id, submitter: ctx.senderQQ }, '[soup] 用户投稿题目');
    await ctx.replyPrivate(
      `✅ 投稿成功！《${title!}》已收录（草稿待审核）\n` +
      `管理员审核通过后将进入题库，感谢你的贡献！`,
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
    _snapshot: SoupRuntimeState,
    ctx: CommandContext,
  ): Promise<void> {
    log.info({ sessionId }, '[soup] running 无活动超时');
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || session.state !== 'running') return;

    // 从 DB 取最新快照，设置宽限期标记
    const freshSnap = session.stateSnapshot as unknown as SoupRuntimeState;
    freshSnap.inGracePeriod = true;
    this.sessionManager.saveSnapshot(sessionId, freshSnap as unknown as Record<string, unknown>);

    const idleTimeoutMin = ctx.configService.get<number>('soup.idle_timeout_minutes') ?? 45;
    const graceMin = ctx.configService.get<number>('soup.idle_grace_minutes') ?? 5;
    const prefix = ctx.configService.getCommandPrefix();

    await ctx.reply(
      `⏰ 超过 ${idleTimeoutMin} 分钟没有提问了，游戏即将结束\n` +
      `• ${prefix}soup ask <问题>  继续提问（重置计时器）\n` +
      `• ${prefix}soup continue   延续游戏（${idleTimeoutMin}分钟计时）\n` +
      `• ${prefix}soup end        立即公布真相并结束\n` +
      `（${graceMin} 分钟内无响应将自动结束）`,
    );

    // 宽限期计时器
    const graceMs = graceMin * 60_000;
    this.sessionManager.registerActivityTimeout(sessionId, graceMs, async () => {
      const s = await this.sessionManager.getSessionById(sessionId);
      if (!s || s.state !== 'running') return;

      const latestSnap = s.stateSnapshot as unknown as SoupRuntimeState;
      const now = Math.floor(Date.now() / 1000);
      const finalScores = calcFinalScores(latestSnap.contribution);

      await this.sessionManager.transitionState(sessionId, 'ended', latestSnap as unknown as Record<string, unknown>, {
        endedAt: now,
        endReason: 'timeout',
      });

      // 保存超时结束的游玩记录
      for (const score of finalScores) {
        const p = latestSnap.contribution.players[score.qq];
        await this.soupService.savePlayRecord({
          userQq: score.qq,
          puzzleId: puzzle.id,
          sessionId,
          result: 'giveup',
          contributionScore: score.score,
          breakthroughCount: score.breakthroughCount,
          questionsAsked: score.questionsAsked,
          joinedAt: p?.joinedAt ?? now,
        });
      }

      const toDiffStars = '★'.repeat(puzzle.difficulty) + '☆'.repeat(5 - puzzle.difficulty);
      const toTagsLine = puzzle.tags?.length ? ` · 标签：${puzzle.tags.join(' ')}` : '';
      await ctx.reply(
        `⏰ 宽限期结束，游戏超时结束\n\n` +
        `【真相揭晓】\n${puzzle.truth}\n\n` +
        `📊 《${puzzle.title}》${toDiffStars}${toTagsLine}`,
      );
    });
  }

  // ── 工具方法 ─────────────────────────────────────────────────────────────

  private async getRunningSession(ctx: CommandContext) {
    const effectiveGroupId = this.getEffectiveGroupId(ctx);
    if (!effectiveGroupId) return null;
    const roomId = await this.sessionManager.getRoomIdByGroupId(effectiveGroupId, 'qq');
    if (!roomId) {
      await ctx.reply('⚠️ 当前没有进行中的游戏，输入 .soup start 开始');
      return null;
    }
    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session) {
      await ctx.reply('⚠️ 当前没有进行中的游戏，输入 .soup start 开始');
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
      `${prefix}soup giveup     — 投票放弃（需半数同意）\n` +
      `${prefix}soup end        — 宽限期内确认结束\n` +
      `${prefix}soup continue   — 宽限期内延续游戏\n` +
      `${prefix}soup change     — 换题\n` +
      `${prefix}soup submit     — 投稿题目`
    );
  }
}
