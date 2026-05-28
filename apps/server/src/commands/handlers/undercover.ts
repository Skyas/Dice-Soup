/**
 * @module commands/handlers/undercover
 * 谁是卧底游戏指令处理器。
 *
 * 指令：
 *   .undercover start   — 创建房间
 *   .undercover stop    — 强制结束（管理员）
 *   .undercover help    — 帮助
 *   .undercover info    — 查看当前游戏状态
 *
 * 通用桌游指令（.join / .leave / .ready / .vote / .kick）
 * 由 BoardGameCommonHandler 处理，并回调本模块。
 */

import { createLogger } from '@dice-soup/logger';
import {
  createInitialUndercoverState,
  startGame,
  getCurrentSpeaker,
  recordSpeechAndAdvance,
  castVote,
  processVotes,
  applyElimination,
  enterPKPhase,
  startNextRound,
  checkWinCondition,
  hasAllVoted,
  isPlayerAlive,
  getAlivePlayerCount,
} from '@dice-soup/game-undercover';
import {
  addPlayerToLobby,
  removePlayerFromLobby,
  initiateVote,
  castLobbyVote,
} from '@dice-soup/game-common';
import type { UndercoverGameState } from '@dice-soup/game-undercover';
import type { PlatformAdapter } from '@dice-soup/shared-types';
import { textMessage } from '@dice-soup/shared-types';
import type { CommandContext, CommandHandler, CommandMeta } from '../types';
import type { SessionManager } from '../../services/session-manager';
import type { UndercoverService } from '../../services/undercover-service';
import { selectRandomWordPair } from '@dice-soup/game-undercover';

const log = createLogger({ module: 'cmd:undercover' });

const ROLE_LABELS: Record<string, string> = {
  civilian: '平民',
  undercover: '卧底',
  blank: '白板',
};

const WINNER_LABELS: Record<string, string> = {
  civilian: '平民',
  undercover: '卧底',
  blank: '白板',
};

/** 大厅超时（分钟） */
const LOBBY_TIMEOUT_MINUTES = 30;
/** 发言超时（秒） */
const SPEECH_TIMEOUT_SECONDS = 120;
/** 投票超时（秒） */
const VOTE_TIMEOUT_SECONDS = 120;

export class UndercoverHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'undercover',
    aliases: ['卧底'],
    action: 'write',
    scope: 'session',
    channel: 'group_only',
    requiredRole: 'guest',
    nlAllowed: false,
    description: '谁是卧底桌游（.undercover start 开始，.undercover help 帮助）',
  };

  private adapter?: PlatformAdapter;

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly undercoverService: UndercoverService,
  ) {}

  setAdapter(adapter: PlatformAdapter): void {
    this.adapter = adapter;
  }

  async execute(ctx: CommandContext): Promise<void> {
    const sub = ctx.args[0]?.toLowerCase() ?? '';

    switch (sub) {
      case 'start': return this.handleStart(ctx);
      case 'stop':  return this.handleStop(ctx);
      case 'info':  return this.handleInfo(ctx);
      case 'help':
      case '':
        return ctx.reply(this.buildHelpText(ctx.configService.getCommandPrefix()));
      default:
        return ctx.reply(
          `❓ 未知子命令 "undercover ${sub}"，输入 .undercover help 查看帮助`,
        );
    }
  }

  // ── start ─────────────────────────────────────────────────────────────────

  private async handleStart(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 谁是卧底只能在群里开局');

    await ctx.userService.ensureUserExists(ctx.senderQQ, ctx.senderName);

    const initialState = createInitialUndercoverState(ctx.senderQQ, ctx.senderName);

    const result = await this.sessionManager.createSession(
      ctx.groupId,
      'qq',
      ctx.senderQQ,
      initialState as unknown as Record<string, unknown>,
      'undercover',
    );

    if (!result.ok) {
      return ctx.reply(`⚠️ ${result.reason}`);
    }

    const { sessionId } = result;
    log.info({ sessionId, senderQQ: ctx.senderQQ }, '[undercover] 房间创建');

    // 注册大厅超时
    this.sessionManager.registerActivityTimeout(
      sessionId,
      LOBBY_TIMEOUT_MINUTES * 60_000,
      async () => {
        const session = await this.sessionManager.getSessionById(sessionId);
        if (!session || session.state !== 'setup') return;
        await this.sessionManager.transitionState(sessionId, 'aborted', session.stateSnapshot, {
          endedAt: Math.floor(Date.now() / 1000),
          endReason: 'lobby_timeout',
        });
        await ctx.reply('⏰ 准备阶段超时（30分钟无操作），房间已解散');
      },
    );

    const prefix = ctx.configService.getCommandPrefix();
    await ctx.reply(
      `🕵️ ${ctx.senderName} 发起了【谁是卧底】！\n\n` +
      `玩家请输入 ${prefix}join 加入（最少 4 人，最多 12 人）\n` +
      `人数充足后输入 ${prefix}ready 发起开始投票\n\n` +
      `（30 分钟内无操作将自动解散）`,
    );
  }

  // ── stop ──────────────────────────────────────────────────────────────────

  private async handleStop(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    // 简单的管理员检查：admin_qq_list 或发起人
    const adminList = ctx.configService.get<string[]>('admin_qq_list') ?? [];
    const session = await this.getActiveSession(ctx);
    if (!session) return;

    const isAdmin = adminList.map(String).includes(String(ctx.senderQQ));
    const isCreator = session.createdBy === ctx.senderQQ;
    if (!isAdmin && !isCreator) {
      return ctx.reply('⚠️ 只有管理员或房主可以强制结束游戏');
    }

    this.sessionManager.clearActivityTimeout(session.id);
    await this.sessionManager.transitionState(session.id, 'aborted', session.stateSnapshot, {
      endedAt: Math.floor(Date.now() / 1000),
      endReason: 'admin_stop',
    });

    await ctx.reply('🛑 管理员强制结束游戏');
  }

  // ── info ──────────────────────────────────────────────────────────────────

  private async handleInfo(ctx: CommandContext): Promise<void> {
    const session = await this.getActiveSession(ctx);
    if (!session) return;

    const state = session.stateSnapshot as unknown as UndercoverGameState;

    if (state.phase === 'lobby') {
      const playerList = state.lobby.players.map((p) => `  · ${p.displayName}`).join('\n');
      await ctx.reply(
        `🕵️ 谁是卧底 · 准备阶段\n` +
        `玩家（${state.lobby.players.length}人）：\n${playerList}\n\n` +
        `人数达 4 人后输入 .ready 发起开始投票`,
      );
    } else {
      const alive = state.players.filter((p) => p.alive).length;
      const eliminated = state.eliminatedPlayers.map((e) => `  · ${e.displayName}（${ROLE_LABELS[e.role]}）`).join('\n');
      await ctx.reply(
        `🕵️ 谁是卧底 · 第 ${state.round} 轮 · ${phaseLabel(state.phase)}\n` +
        `存活玩家：${alive} 人\n` +
        (eliminated ? `已出局：\n${eliminated}` : '暂无出局'),
      );
    }
  }

  // ── 外部回调：玩家加入 ────────────────────────────────────────────────────

  async onJoin(ctx: CommandContext, sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || session.state !== 'setup') {
      return ctx.reply('⚠️ 游戏已开始或不存在，无法加入');
    }

    await ctx.userService.ensureUserExists(ctx.senderQQ, ctx.senderName);

    const joinResult = await this.sessionManager.joinSession(sessionId, ctx.senderQQ);
    if (!joinResult.ok) {
      return ctx.reply(`⚠️ ${joinResult.reason}`);
    }

    const state = session.stateSnapshot as unknown as UndercoverGameState;
    const lobbyResult = addPlayerToLobby(state.lobby, ctx.senderQQ, ctx.senderName, 12);
    if (!lobbyResult.ok) {
      // 回滚 session join（简单处理：sessionManager.joinSession 已经写入了，这里只报错）
      return ctx.reply(`⚠️ ${lobbyResult.message}`);
    }

    const newState: UndercoverGameState = { ...state, lobby: lobbyResult.state };
    this.sessionManager.saveSnapshot(sessionId, newState as unknown as Record<string, unknown>);

    // 重置大厅超时
    this.sessionManager.resetActivityTimer(
      sessionId,
      LOBBY_TIMEOUT_MINUTES * 60_000,
      async () => {
        const s = await this.sessionManager.getSessionById(sessionId);
        if (!s || s.state !== 'setup') return;
        await this.sessionManager.transitionState(sessionId, 'aborted', s.stateSnapshot, {
          endedAt: Math.floor(Date.now() / 1000),
          endReason: 'lobby_timeout',
        });
        await ctx.reply('⏰ 准备阶段超时（30分钟无操作），房间已解散');
      },
    );

    await ctx.reply(
      `✅ ${ctx.senderName} 加入游戏！当前 ${newState.lobby.players.length} 人`,
    );
  }

  // ── 外部回调：玩家离开 ────────────────────────────────────────────────────

  async onLeave(ctx: CommandContext, sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || session.state !== 'setup') {
      return ctx.reply('⚠️ 游戏已开始，无法退出准备阶段');
    }

    const state = session.stateSnapshot as unknown as UndercoverGameState;

    // 是否在大厅中
    if (!state.lobby.players.some((p) => p.userQQ === ctx.senderQQ)) {
      return ctx.reply('⚠️ 你不在房间中');
    }

    // 若是房主，解散房间
    if (ctx.senderQQ === state.lobby.creatorQQ) {
      this.sessionManager.clearActivityTimeout(sessionId);
      await this.sessionManager.transitionState(sessionId, 'aborted', state as unknown as Record<string, unknown>, {
        endedAt: Math.floor(Date.now() / 1000),
        endReason: 'creator_left',
      });
      return ctx.reply(`🚪 房主 ${ctx.senderName} 退出，房间已解散`);
    }

    const leaveResult = removePlayerFromLobby(state.lobby, ctx.senderQQ);
    if (!leaveResult.ok) return ctx.reply(`⚠️ ${leaveResult.message}`);

    const newState: UndercoverGameState = { ...state, lobby: leaveResult.state };
    this.sessionManager.saveSnapshot(sessionId, newState as unknown as Record<string, unknown>);

    await ctx.reply(`🚪 ${ctx.senderName} 退出，当前 ${newState.lobby.players.length} 人`);
  }

  // ── 外部回调：ready（发起开始投票） ──────────────────────────────────────

  async onReady(ctx: CommandContext, sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || session.state !== 'setup') {
      return ctx.reply('⚠️ 游戏已开始或不存在');
    }

    const state = session.stateSnapshot as unknown as UndercoverGameState;

    if (!state.lobby.players.some((p) => p.userQQ === ctx.senderQQ)) {
      return ctx.reply('⚠️ 你不在房间中，请先 .join 加入');
    }

    if (state.lobby.players.length < 4) {
      return ctx.reply(`⚠️ 至少需要 4 人才能开始（当前 ${state.lobby.players.length} 人）`);
    }

    // 发起开始投票（60 秒超时）
    const voteResult = initiateVote(
      state.lobby,
      { type: 'start', initiatorQQ: ctx.senderQQ },
      60,
    );
    if (!voteResult.ok) {
      if (voteResult.code === 'GAME_COMMON_VOTE_ALREADY_ACTIVE') {
        return ctx.reply('⚠️ 已有进行中的投票，请先用 .vote yes/no 投票');
      }
      return ctx.reply(`⚠️ ${voteResult.message}`);
    }

    const newState: UndercoverGameState = { ...state, lobby: voteResult.state };
    this.sessionManager.saveSnapshot(sessionId, newState as unknown as Record<string, unknown>);

    const playerList = state.lobby.players.map((p) => `@${p.displayName}`).join(' ');
    await ctx.reply(
      `🗳️ ${ctx.senderName} 发起开始投票！\n` +
      `${playerList}\n请在 60 秒内输入 .vote yes 或 .vote no`,
    );
  }

  // ── 外部回调：投票（大厅 yes/no 或游戏阶段 @目标） ────────────────────────

  async onVote(ctx: CommandContext, sessionId: string, rawArgs: string): Promise<void> {
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session) return ctx.reply('⚠️ 找不到当前会话');

    const state = session.stateSnapshot as unknown as UndercoverGameState;

    // 大厅投票
    if (session.state === 'setup' && state.phase === 'lobby') {
      return this.handleLobbyVote(ctx, sessionId, state, rawArgs);
    }

    // 游戏内投票
    if (session.state === 'running' && (state.phase === 'voting' || state.phase === 'pk_voting')) {
      return this.handleGameVote(ctx, sessionId, state, rawArgs);
    }

    await ctx.reply('⚠️ 当前没有进行中的投票');
  }

  private async handleLobbyVote(
    ctx: CommandContext,
    sessionId: string,
    state: UndercoverGameState,
    rawArgs: string,
  ): Promise<void> {
    if (!state.lobby.pendingVote) {
      return ctx.reply('⚠️ 当前没有进行中的投票，请先 .ready 发起');
    }

    const approve = rawArgs.trim().toLowerCase() === 'yes' || rawArgs.trim() === '是' || rawArgs.trim() === '同意';
    const reject = rawArgs.trim().toLowerCase() === 'no' || rawArgs.trim() === '否' || rawArgs.trim() === '反对';

    if (!approve && !reject) {
      return ctx.reply('⚠️ 请输入 .vote yes 或 .vote no');
    }

    const voteResult = castLobbyVote(state.lobby, ctx.senderQQ, approve, 'unanimous');
    if (!voteResult.ok) {
      return ctx.reply(`⚠️ ${voteResult.message}`);
    }

    let newState: UndercoverGameState = { ...state, lobby: voteResult.state };

    if (voteResult.result.status === 'recorded') {
      this.sessionManager.saveSnapshot(sessionId, newState as unknown as Record<string, unknown>);
      const approvals = Object.values(voteResult.state.pendingVote?.votes ?? {}).filter(Boolean).length;
      await ctx.reply(`🗳️ ${ctx.senderName} 投票${approve ? '同意' : '反对'}（${approvals}/${state.lobby.players.length}）`);
      return;
    }

    if (voteResult.result.status === 'failed') {
      this.sessionManager.saveSnapshot(sessionId, newState as unknown as Record<string, unknown>);
      return ctx.reply('❌ 有人反对，开始投票失败，可重新发起');
    }

    // 全员同意 → 开始游戏
    await this.doStartGame(ctx, sessionId, newState);
  }

  private async doStartGame(
    ctx: CommandContext,
    sessionId: string,
    state: UndercoverGameState,
  ): Promise<void> {
    const enableBlank = ctx.configService.get<boolean>('undercover.enable_blank', true);

    // 获取词对（排除本次所有玩家玩过的词对）
    const wordPairs = await this.undercoverService.getActiveWordPairs();
    if (wordPairs.length === 0) {
      return ctx.reply('⚠️ 词库为空，无法开始游戏，请管理员添加词对');
    }

    const excludeIds = new Set<string>();
    for (const p of state.lobby.players) {
      const ids = await this.undercoverService.getPlayedWordPairIds(p.userQQ);
      ids.forEach((id) => excludeIds.add(id));
    }

    const wordPair = selectRandomWordPair(wordPairs, Array.from(excludeIds))
      ?? selectRandomWordPair(wordPairs); // 全部玩过则不限制

    if (!wordPair) {
      return ctx.reply('⚠️ 词库为空，无法开始游戏');
    }

    const newState = startGame(state, wordPair, enableBlank);
    if (!newState) {
      return ctx.reply(`⚠️ 人数（${state.lobby.players.length}）不符合配置`);
    }

    // 转换 session 状态
    await this.sessionManager.transitionState(
      sessionId,
      'running',
      newState as unknown as Record<string, unknown>,
      { startedAt: Math.floor(Date.now() / 1000) },
    );

    // 私聊发送词语卡（每位玩家独立私信）
    for (const player of newState.players) {
      let wordMsg: string;
      if (player.role === 'civilian') {
        wordMsg = `🕵️ 【谁是卧底】\n\n你的身份：平民\n你的词语：${newState.normalWord}\n\n用一句话描述你的词语，但不能直接说出这个词。\n\n⚠️ 此消息仅你可见`;
      } else if (player.role === 'undercover') {
        wordMsg = `🕵️ 【谁是卧底】\n\n你的身份：卧底\n你的词语：${newState.undercoverWord}\n\n用一句话描述你的词语，隐藏身份存活到最后！\n\n⚠️ 此消息仅你可见`;
      } else {
        wordMsg = `🕵️ 【谁是卧底】\n\n你的身份：白板\n你没有词语，请根据他人发言推断并伪装！\n\n⚠️ 此消息仅你可见`;
      }
      try {
        if (this.adapter) {
          await this.adapter.sendPrivateMessage(player.userQQ, textMessage(wordMsg));
        } else if (player.userQQ === ctx.senderQQ) {
          await ctx.replyPrivate(wordMsg);
        }
      } catch (e) {
        log.warn({ err: e, userQQ: player.userQQ }, '[undercover] 私聊词语卡发送失败');
      }
    }

    log.info({ sessionId, playerCount: newState.players.length }, '[undercover] 游戏开始');

    // 注册发言超时
    this.sessionManager.registerActivityTimeout(
      sessionId,
      SPEECH_TIMEOUT_SECONDS * 1000,
      () => this.onSpeakingTimeout(ctx, sessionId),
    );

    const playerNames = newState.players.map((p, i) => `${i + 1}. ${p.displayName}`).join('\n');
    await ctx.reply(
      `🎮 游戏开始！\n\n` +
      `玩家列表：\n${playerNames}\n\n` +
      `📬 词语卡已通过私聊发送，请查收。\n\n` +
      `第 1 轮发言开始！`,
    );

    // 开始第一位发言
    await this.promptNextSpeaker(ctx, sessionId, newState);
  }

  // ── 外部回调：发言（非指令消息） ─────────────────────────────────────────

  async onGroupMessage(ctx: CommandContext, sessionId: string, text: string): Promise<void> {
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || session.state !== 'running') return;

    const state = session.stateSnapshot as unknown as UndercoverGameState;
    if (state.phase !== 'speaking' && state.phase !== 'pk_speaking') return;

    const currentSpeaker = getCurrentSpeaker(state);
    if (!currentSpeaker || currentSpeaker !== ctx.senderQQ) return; // 不是当前发言人，忽略

    // 记录发言，推进到下一位
    const { state: newState, allDone } = recordSpeechAndAdvance(state, text);

    this.sessionManager.clearActivityTimeout(sessionId);

    if (allDone) {
      // 所有人发言完毕 → 进入投票
      await this.sessionManager.transitionState(
        sessionId,
        'running',
        newState as unknown as Record<string, unknown>,
      );
      await this.startVotingPhase(ctx, sessionId, newState);
    } else {
      this.sessionManager.saveSnapshot(sessionId, newState as unknown as Record<string, unknown>);
      // 注册下一位发言超时
      this.sessionManager.registerActivityTimeout(
        sessionId,
        SPEECH_TIMEOUT_SECONDS * 1000,
        () => this.onSpeakingTimeout(ctx, sessionId),
      );
      await this.promptNextSpeaker(ctx, sessionId, newState);
    }
  }

  private async promptNextSpeaker(
    ctx: CommandContext,
    _sessionId: string,
    state: UndercoverGameState,
  ): Promise<void> {
    const speakerQQ = getCurrentSpeaker(state);
    if (!speakerQQ) return;

    const speaker = state.players.find((p) => p.userQQ === speakerQQ);
    if (!speaker) return;

    const isPK = state.phase === 'pk_speaking';
    const timeoutSec = SPEECH_TIMEOUT_SECONDS;

    await ctx.reply(
      `${isPK ? '⚔️ 平票加赛 · ' : ''}@${speaker.displayName} 请发言（${timeoutSec} 秒内，你的第一条消息将被记录）`,
    );
  }

  private async onSpeakingTimeout(ctx: CommandContext, sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || session.state !== 'running') return;

    const state = session.stateSnapshot as unknown as UndercoverGameState;
    if (state.phase !== 'speaking' && state.phase !== 'pk_speaking') return;

    const speakerQQ = getCurrentSpeaker(state);
    const speaker = state.players.find((p) => p.userQQ === speakerQQ);

    await ctx.reply(`⏰ @${speaker?.displayName ?? speakerQQ} 发言超时，自动跳过`);

    const { state: newState, allDone } = recordSpeechAndAdvance(state, '（超时未发言）');

    if (allDone) {
      await this.sessionManager.transitionState(
        sessionId,
        'running',
        newState as unknown as Record<string, unknown>,
      );
      await this.startVotingPhase(ctx, sessionId, newState);
    } else {
      this.sessionManager.saveSnapshot(sessionId, newState as unknown as Record<string, unknown>);
      this.sessionManager.registerActivityTimeout(
        sessionId,
        SPEECH_TIMEOUT_SECONDS * 1000,
        () => this.onSpeakingTimeout(ctx, sessionId),
      );
      await this.promptNextSpeaker(ctx, sessionId, newState);
    }
  }

  private async startVotingPhase(
    ctx: CommandContext,
    sessionId: string,
    state: UndercoverGameState,
  ): Promise<void> {
    const alivePlayers = state.players.filter((p) => p.alive);
    const playerList = alivePlayers.map((p) => `  @${p.displayName}`).join('\n');

    await ctx.reply(
      `🗳️ 发言结束，投票阶段开始！\n\n` +
      `存活玩家：\n${playerList}\n\n` +
      `输入 .vote @玩家名 投票淘汰（${VOTE_TIMEOUT_SECONDS} 秒内）`,
    );

    this.sessionManager.registerActivityTimeout(
      sessionId,
      VOTE_TIMEOUT_SECONDS * 1000,
      () => this.onVotingTimeout(ctx, sessionId),
    );
  }

  private async handleGameVote(
    ctx: CommandContext,
    sessionId: string,
    state: UndercoverGameState,
    rawArgs: string,
  ): Promise<void> {
    // 解析 @目标 或直接名字
    const targetName = rawArgs.trim().replace(/^@/, '');
    if (!targetName) {
      return ctx.reply('⚠️ 请指定投票目标，例如：.vote @小明');
    }

    // 查找目标玩家（按显示名或 QQ）
    const target = state.players.find(
      (p) => p.alive && (p.displayName === targetName || p.userQQ === targetName),
    );
    if (!target) {
      const aliveNames = state.players.filter((p) => p.alive).map((p) => p.displayName).join('、');
      return ctx.reply(`⚠️ 找不到玩家 "${targetName}"，存活玩家：${aliveNames}`);
    }

    // 检查投票者是否存活
    if (!isPlayerAlive(state, ctx.senderQQ)) {
      return ctx.reply('⚠️ 你已出局，无法投票');
    }

    const voteResult = castVote(state, ctx.senderQQ, target.userQQ);
    if (!voteResult.ok) {
      return ctx.reply(`⚠️ ${voteResult.reason}`);
    }

    const newState = voteResult.state;
    this.sessionManager.saveSnapshot(sessionId, newState as unknown as Record<string, unknown>);

    const voter = state.players.find((p) => p.userQQ === ctx.senderQQ);
    const votedCount = Object.keys(newState.votes).length;
    const totalAlive = state.players.filter((p) => p.alive).length;
    await ctx.reply(
      `🗳️ ${voter?.displayName ?? ctx.senderQQ} → @${target.displayName}（${votedCount}/${totalAlive} 已投）`,
    );

    // 检查是否全部投完
    if (hasAllVoted(newState)) {
      this.sessionManager.clearActivityTimeout(sessionId);
      await this.resolveVotes(ctx, sessionId, newState);
    }
  }

  private async onVotingTimeout(ctx: CommandContext, sessionId: string): Promise<void> {
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || session.state !== 'running') return;

    const state = session.stateSnapshot as unknown as UndercoverGameState;
    if (state.phase !== 'voting' && state.phase !== 'pk_voting') return;

    // 未投票的玩家不计入
    if (Object.keys(state.votes).length === 0) {
      await ctx.reply('⏰ 投票超时，无人投票，跳过本轮淘汰，直接进入下一轮');
      const nextState = startNextRound(state, '');
      await this.sessionManager.transitionState(sessionId, 'running', nextState as unknown as Record<string, unknown>);
      await this.promptNextSpeaker(ctx, sessionId, nextState);
      return;
    }

    await ctx.reply('⏰ 投票超时，以已收到的票数计算结果...');
    await this.resolveVotes(ctx, sessionId, state);
  }

  private async resolveVotes(
    ctx: CommandContext,
    sessionId: string,
    state: UndercoverGameState,
  ): Promise<void> {
    const result = processVotes(state);

    if (result.type === 'pk') {
      const pkNames = (result.pkPlayers ?? [])
        .map((qq) => state.players.find((p) => p.userQQ === qq)?.displayName ?? qq)
        .join(' 和 ');

      await ctx.reply(
        `⚔️ 平票！${pkNames} 进入加赛！\n请加赛玩家各发言一次，其余玩家重新投票`,
      );

      const pkState = enterPKPhase(state, result.pkPlayers!);
      await this.sessionManager.transitionState(sessionId, 'running', pkState as unknown as Record<string, unknown>);

      this.sessionManager.registerActivityTimeout(
        sessionId,
        SPEECH_TIMEOUT_SECONDS * 1000,
        () => this.onSpeakingTimeout(ctx, sessionId),
      );
      await this.promptNextSpeaker(ctx, sessionId, pkState);
      return;
    }

    // 淘汰
    const eliminated = result.eliminated!;
    let newState = applyElimination(state, eliminated);

    await ctx.reply(
      `🚫 票数最多的玩家出局！\n` +
      `出局：${eliminated.displayName} — 身份是【${ROLE_LABELS[eliminated.role]}】`,
    );

    // 检查胜负
    const winResult = checkWinCondition(newState);
    if (winResult) {
      newState = { ...newState, phase: 'ended', winner: winResult.winner, winnerQQs: winResult.winnerQQs };
      await this.sessionManager.transitionState(sessionId, 'ended', newState as unknown as Record<string, unknown>, {
        endedAt: Math.floor(Date.now() / 1000),
        endReason: 'game_over',
      });
      await this.announceGameEnd(ctx, sessionId, newState);
      return;
    }

    // 继续下一轮
    const nextState = startNextRound(newState, eliminated.userQQ);
    await this.sessionManager.transitionState(sessionId, 'running', nextState as unknown as Record<string, unknown>);

    const aliveCount = getAlivePlayerCount(nextState);
    await ctx.reply(
      `✅ 第 ${state.round} 轮结束，存活玩家 ${aliveCount} 人\n第 ${nextState.round} 轮发言开始！`,
    );

    this.sessionManager.registerActivityTimeout(
      sessionId,
      SPEECH_TIMEOUT_SECONDS * 1000,
      () => this.onSpeakingTimeout(ctx, sessionId),
    );
    await this.promptNextSpeaker(ctx, sessionId, nextState);
  }

  private async announceGameEnd(
    ctx: CommandContext,
    sessionId: string,
    state: UndercoverGameState,
  ): Promise<void> {
    const winnerLabel = state.winner ? WINNER_LABELS[state.winner] : '???';

    // 公布所有人身份
    const identities = state.players
      .map((p) => {
        const statusIcon = p.alive ? '✅' : '❌';
        return `${statusIcon} ${p.displayName} — ${ROLE_LABELS[p.role]}`;
      })
      .join('\n');

    await ctx.reply(
      `🎉 游戏结束！【${winnerLabel}】获胜！\n\n` +
      `平民词：${state.normalWord}\n` +
      `卧底词：${state.undercoverWord}\n\n` +
      `玩家身份：\n${identities}`,
    );

    // 保存游玩记录
    for (const player of state.players) {
      const won = state.winnerQQs.includes(player.userQQ);
      // 计算存活轮数
      const elimInfo = state.eliminatedPlayers.find((e) => e.userQQ === player.userQQ);
      const survivedRounds = elimInfo ? elimInfo.round - 1 : state.round;

      try {
        await this.undercoverService.savePlayRecord({
          userQq: player.userQQ,
          sessionId,
          wordPairId: state.wordPairId,
          role: player.role,
          result: won ? 'win' : 'lose',
          survivedRounds,
        });
      } catch (e) {
        log.warn({ err: e, userQQ: player.userQQ }, '[undercover] 游玩记录保存失败');
      }
    }

    log.info({ sessionId, winner: state.winner }, '[undercover] 游戏结束');
  }

  // ── 外部回调：踢人 ────────────────────────────────────────────────────────

  async onKick(ctx: CommandContext, sessionId: string, targetName: string): Promise<void> {
    const session = await this.sessionManager.getSessionById(sessionId);
    if (!session || session.state !== 'setup') {
      return ctx.reply('⚠️ 只能在准备阶段发起踢人投票');
    }

    const state = session.stateSnapshot as unknown as UndercoverGameState;

    // 查找目标
    const target = state.lobby.players.find(
      (p) => p.displayName === targetName || p.userQQ === targetName,
    );
    if (!target) {
      return ctx.reply(`⚠️ 找不到玩家 "${targetName}"`);
    }

    const voteResult = initiateVote(
      state.lobby,
      { type: 'kick', targetQQ: target.userQQ, initiatorQQ: ctx.senderQQ },
      30,
    );
    if (!voteResult.ok) {
      return ctx.reply(`⚠️ ${voteResult.message}`);
    }

    const newState: UndercoverGameState = { ...state, lobby: voteResult.state };
    this.sessionManager.saveSnapshot(sessionId, newState as unknown as Record<string, unknown>);

    const threshold = Math.ceil(state.lobby.players.length / 2);
    await ctx.reply(
      `🗳️ ${ctx.senderName} 发起踢出 ${target.displayName} 的投票\n` +
      `需要 ${threshold} 票同意，输入 .vote yes/no（30秒有效）`,
    );
  }

  // ── 工具 ──────────────────────────────────────────────────────────────────

  private async getActiveSession(ctx: CommandContext) {
    if (!ctx.groupId) return null;
    const roomId = await this.sessionManager.getRoomIdByGroupId(ctx.groupId, 'qq');
    if (!roomId) {
      await ctx.reply('⚠️ 当前群没有进行中的游戏，输入 .undercover start 开始');
      return null;
    }
    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session || session.gameType !== 'undercover') {
      await ctx.reply('⚠️ 当前群没有进行中的谁是卧底游戏');
      return null;
    }
    return session;
  }

  private buildHelpText(prefix: string): string {
    return (
      `🕵️ 谁是卧底 指令帮助：\n` +
      `${prefix}undercover start  — 创建房间\n` +
      `${prefix}join              — 加入当前房间\n` +
      `${prefix}leave             — 退出准备阶段\n` +
      `${prefix}ready             — 发起开始投票\n` +
      `${prefix}vote yes/no       — 开始/踢人投票\n` +
      `${prefix}vote @玩家名      — 游戏中投票淘汰\n` +
      `${prefix}kick @玩家名      — 发起踢人投票\n` +
      `${prefix}undercover stop   — 管理员强制结束\n` +
      `${prefix}undercover info   — 查看游戏状态`
    );
  }
}

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    speaking: '发言阶段',
    voting: '投票阶段',
    pk_speaking: '平票加赛发言',
    pk_voting: '平票加赛投票',
    ended: '游戏结束',
  };
  return labels[phase] ?? phase;
}
