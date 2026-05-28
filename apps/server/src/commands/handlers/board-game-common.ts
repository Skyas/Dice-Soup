/**
 * @module commands/handlers/board-game-common
 * 通用桌游指令处理器。
 *
 * 处理所有桌游共用指令：.join / .leave / .ready / .vote / .kick
 * 根据当前活跃会话的 gameType 派发到对应游戏 handler。
 */

import { createLogger } from '@dice-soup/logger';
import type { CommandContext, CommandHandler, CommandMeta } from '../types';
import type { SessionManager } from '../../services/session-manager';
import type { UndercoverHandler } from './undercover';

const log = createLogger({ module: 'cmd:board-game-common' });

type BoardGameCommandType = 'join' | 'leave' | 'ready' | 'vote' | 'kick';

const COMMAND_META: Record<BoardGameCommandType, Omit<CommandMeta, 'name'>> = {
  join: {
    aliases: ['加入'],
    action: 'write',
    scope: 'session',
    channel: 'group_only',
    requiredRole: 'guest',
    nlAllowed: false,
    description: '加入当前游戏房间',
  },
  leave: {
    aliases: ['离开', '退出'],
    action: 'write',
    scope: 'session',
    channel: 'group_only',
    requiredRole: 'guest',
    nlAllowed: false,
    description: '退出当前游戏房间（仅准备阶段）',
  },
  ready: {
    aliases: ['准备'],
    action: 'write',
    scope: 'session',
    channel: 'group_only',
    requiredRole: 'guest',
    nlAllowed: false,
    description: '发起开始游戏投票',
  },
  vote: {
    aliases: ['投票'],
    action: 'write',
    scope: 'session',
    channel: 'group_only',
    requiredRole: 'guest',
    nlAllowed: false,
    description: '投票（大厅：yes/no；游戏中：.vote @玩家名）',
  },
  kick: {
    aliases: ['踢人'],
    action: 'write',
    scope: 'session',
    channel: 'group_only',
    requiredRole: 'guest',
    nlAllowed: false,
    description: '发起踢人投票（准备阶段）',
  },
};

export class BoardGameCommonHandler implements CommandHandler {
  readonly meta: CommandMeta;

  constructor(
    private readonly commandType: BoardGameCommandType,
    private readonly sessionManager: SessionManager,
    private readonly undercoverHandler: UndercoverHandler,
  ) {
    this.meta = { name: commandType, ...COMMAND_META[commandType] };
  }

  async execute(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    const roomId = await this.sessionManager.getRoomIdByGroupId(ctx.groupId, 'qq');
    const session = roomId
      ? await this.sessionManager.getActiveSessionByRoom(roomId)
      : null;

    if (!session) {
      return ctx.reply('⚠️ 当前群没有进行中的游戏');
    }

    log.debug({ commandType: this.commandType, sessionId: session.id, gameType: session.gameType }, '[board-game-common] 派发命令');

    if (session.gameType === 'undercover') {
      switch (this.commandType) {
        case 'join':  return this.undercoverHandler.onJoin(ctx, session.id);
        case 'leave': return this.undercoverHandler.onLeave(ctx, session.id);
        case 'ready': return this.undercoverHandler.onReady(ctx, session.id);
        case 'vote':  return this.undercoverHandler.onVote(ctx, session.id, ctx.rawArgs);
        case 'kick':  return this.undercoverHandler.onKick(ctx, session.id, ctx.rawArgs.replace(/^@/, '').trim());
      }
    }

    return ctx.reply('⚠️ 当前游戏不支持此命令');
  }
}
