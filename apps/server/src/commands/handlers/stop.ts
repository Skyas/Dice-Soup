/**
 * @module commands/handlers/stop
 * 强制结束当前会话（admin 权限）。
 */

import { createLogger } from '@dice-soup/logger';
import type { CommandContext, CommandHandler, CommandMeta } from '../types';
import type { SessionManager } from '../../services/session-manager';

const log = createLogger({ module: 'cmd:stop' });

export class StopHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'stop',
    aliases: [],
    action: 'write',
    scope: 'session',
    channel: 'group_only',
    requiredRole: 'player',
    description: '强制结束当前会话（发起人或 admin）',
  };

  constructor(private readonly sessionManager: SessionManager) {}

  async execute(ctx: CommandContext): Promise<void> {
    if (!ctx.groupId) return ctx.reply('⚠️ 请在群里使用此命令');

    const roomId = await this.sessionManager.getRoomIdByGroupId(ctx.groupId, 'qq');
    if (!roomId) return ctx.reply('当前群没有进行中的游戏');

    const session = await this.sessionManager.getActiveSessionByRoom(roomId);
    if (!session) return ctx.reply('当前群没有进行中的游戏');

    // 权限：发起人或有 admin 角色
    if (session.createdBy !== ctx.senderQQ) {
      return ctx.reply('⚠️ 只有游戏发起人可以强制结束游戏');
    }

    this.sessionManager.clearActivityTimeout(session.id);

    const now = Math.floor(Date.now() / 1000);
    await this.sessionManager.transitionState(
      session.id,
      'aborted',
      session.stateSnapshot,
      { endedAt: now, endReason: 'admin_stop' },
    );

    log.info({ sessionId: session.id, by: ctx.senderQQ }, '[stop] 会话强制终止');
    await ctx.reply(`🛑 游戏已由 ${ctx.senderName} 强制结束`);
  }
}
